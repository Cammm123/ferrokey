// Passphrase-locked backup file: the 32-byte seed + style, encrypted with
// AES-256-GCM under a key stretched from the passphrase with Argon2id.

import { argon2idAsync } from "@noble/hashes/argon2.js";
import { parseStyle, type Style } from "../style";
import { fromB64url, fromUtf8, randomBytes, toB64url, utf8 } from "./encoding";
import { SEED_BYTES } from "./identity";

export type KdfParams = { t: number; m: number; p: number }; // m in KiB

/** 64 MiB, 3 passes: a few seconds on a phone, very slow to guess at scale. */
export const DEFAULT_KDF: KdfParams = { t: 3, m: 64 * 1024, p: 1 };

type BackupFile = {
  format: "ferrokey-backup";
  v: 1;
  kdf: { alg: "argon2id" } & KdfParams & { salt: string };
  iv: string;
  ct: string;
};

/** Passphrases must be 4+ words or 14+ characters. Returns a reason, or null if fine. */
export function passphraseProblem(p: string): string | null {
  const words = p.trim().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length >= 4 || p.length >= 14) return null;
  return "Use at least 4 words or 14 characters.";
}

async function aesKey(passphrase: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  const raw = await argon2idAsync(utf8(passphrase.normalize("NFKC")), salt, { ...kdf, dkLen: 32 });
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function makeBackup(seed: Uint8Array, style: Style, passphrase: string, kdf = DEFAULT_KDF): Promise<string> {
  const salt = randomBytes(16), iv = randomBytes(12);
  const header = { alg: "argon2id" as const, ...kdf, salt: toB64url(salt) };
  const body = utf8(JSON.stringify({ seed: toB64url(seed), style: parseStyle(style) }));
  const ad = utf8(JSON.stringify(header));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: ad as BufferSource },
    await aesKey(passphrase, salt, kdf), body as BufferSource);
  const file: BackupFile = { format: "ferrokey-backup", v: 1, kdf: header, iv: toB64url(iv), ct: toB64url(new Uint8Array(ct)) };
  return JSON.stringify(file, null, 2);
}

/** Throws "wrong passphrase or damaged file" if it can't be opened. */
export async function openBackup(text: string, passphrase: string): Promise<{ seed: Uint8Array; style: Style }> {
  let file: BackupFile;
  try { file = JSON.parse(text); } catch { throw new Error("not a ferrokey backup file"); }
  if (file?.format !== "ferrokey-backup" || file.v !== 1 || file.kdf?.alg !== "argon2id") throw new Error("not a ferrokey backup file");
  const { t, m, p, salt } = file.kdf;
  if (![t, m, p].every(Number.isSafeInteger) || t < 1 || t > 10 || m < 8 || m > 1024 * 1024 || p !== 1) throw new Error("not a ferrokey backup file");
  const ad = utf8(JSON.stringify({ alg: "argon2id", t, m, p, salt }));
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64url(file.iv) as BufferSource, additionalData: ad as BufferSource },
      await aesKey(passphrase, fromB64url(salt), { t, m, p }), fromB64url(file.ct) as BufferSource));
  } catch {
    throw new Error("wrong passphrase or damaged file");
  }
  const parsed = JSON.parse(fromUtf8(body));
  const seed = fromB64url(parsed.seed);
  if (seed.length !== SEED_BYTES) throw new Error("damaged file");
  return { seed, style: parseStyle(parsed.style) };
}
