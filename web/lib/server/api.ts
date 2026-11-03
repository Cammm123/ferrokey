// Request handling for drops and profiles, kept apart from Next.js so tests can
// call it directly. The routes in app/api/ are thin wrappers around these.

import "server-only";
import { sha256 } from "@noble/hashes/sha2.js";
import { concat, fromB64url, isB32, randomBytes, toB32, toB64url, utf8 } from "../crypto/encoding";
import { verifyProfile } from "../crypto/profile";
import type { Store } from "../store/types";

export type Result = { status: number; body: unknown };

export const MAX_BLOB_BYTES = 64 * 1024;
export const TTL_DAYS = [1, 7, 30] as const;
export const LIMITS = { drop: 30, profile: 10 } as const; // per IP per hour
const HOUR = 3600_000, DAY = 86_400_000;

const fail = (status: number, error: string): Result => ({ status, body: { error } });

/** Client IP as a salted hash: the raw address is never stored. */
export function ipKey(ip: string): string {
  const salt = process.env.RATE_SALT;
  if (!salt && process.env.NODE_ENV === "production") throw new Error("RATE_SALT must be set in production");
  return ipHash(salt ?? "ferrokey-dev-salt", ip);
}

function ipHash(salt: string, ip: string): string {
  return toB64url(sha256(concat(utf8(salt), utf8("|"), utf8(ip)))).slice(0, 32);
}

async function overLimit(store: Store, kind: keyof typeof LIMITS, ip: string, now: number): Promise<boolean> {
  const window = Math.floor(now / HOUR) * HOUR;
  return (await store.hit(kind + ":" + ipKey(ip), window)) > LIMITS[kind];
}

function isB64urlBytes(s: unknown, min: number, max: number): s is string {
  if (typeof s !== "string" || s.length > Math.ceil((max * 4) / 3)) return false;
  try {
    const n = fromB64url(s).length;
    return n >= min && n <= max;
  } catch {
    return false;
  }
}

export async function createDrop(store: Store, body: unknown, ip: string, now: number): Promise<Result> {
  const b = body as { blob?: unknown; deleteHash?: unknown; ttlDays?: unknown } | null;
  if (!b || !isB64urlBytes(b.blob, 1, MAX_BLOB_BYTES)) return fail(400, "blob must be 1 byte to 64 KB, base64url");
  if (!isB64urlBytes(b.deleteHash, 32, 32)) return fail(400, "deleteHash must be 32 bytes, base64url");
  if (!TTL_DAYS.includes(b.ttlDays as 1)) return fail(400, "ttlDays must be 1, 7 or 30");
  if (await overLimit(store, "drop", ip, now)) return fail(429, "Too many messages from this network. Try again in an hour.");
  const id = toB32(randomBytes(16));
  await store.putDrop({ id, blob: b.blob, deleteHash: b.deleteHash, expiresAt: now + (b.ttlDays as number) * DAY });
  return { status: 201, body: { id, expiresAt: now + (b.ttlDays as number) * DAY } };
}

export async function readDrop(store: Store, id: string, now: number): Promise<Result> {
  if (!isB32(id, 26)) return fail(404, "not found");
  const row = await store.getDrop(id, now);
  return row ? { status: 200, body: { blob: row.blob, expiresAt: row.expiresAt } } : fail(404, "This message has expired or was deleted.");
}

/** Burn after reading: only someone holding the delete token (sealed inside the letter) can delete. */
export async function burnDrop(store: Store, id: string, body: unknown): Promise<Result> {
  const token = (body as { token?: unknown } | null)?.token;
  if (!isB32(id, 26) || !isB64urlBytes(token, 32, 32)) return fail(400, "bad request");
  const hash = toB64url(sha256(concat(utf8("ferrokey-delete-v1"), fromB64url(token))));
  return (await store.deleteDrop(id, hash)) ? { status: 200, body: { deleted: true } } : fail(404, "not found");
}

export async function saveProfile(store: Store, body: unknown, ip: string, now: number): Promise<Result> {
  const rec = (body as { profile?: unknown } | null)?.profile;
  const v = verifyProfile(rec);
  if (!v) return fail(400, "profile signature or format is invalid");
  if (v.updatedAt > now + 5 * 60_000) return fail(400, "profile is dated in the future");
  if (await overLimit(store, "profile", ip, now)) return fail(429, "Too many updates. Try again in an hour.");
  const saved = await store.putProfile(v.id, rec as never);
  return saved ? { status: 200, body: { id: v.id } } : fail(409, "a newer version of this profile is already saved");
}

export async function readProfile(store: Store, id: string): Promise<Result> {
  if (!isB32(id, 26)) return fail(404, "not found");
  const rec = await store.getProfile(id);
  return rec ? { status: 200, body: { profile: rec } } : fail(404, "No profile with this id.");
}
