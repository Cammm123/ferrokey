// Browser-side glue between the pages, the keystore, the crypto and the API.

import { fromB64url, toB64url } from "./crypto/encoding";
import { fingerprint, fingerprintId, identityFromSeed, type Identity, type PublicKeys } from "./crypto/identity";
import { openLetter, sealLetter, type OpenedLetter } from "./crypto/letter";
import { makeProfile, verifyProfile, type VerifiedProfile } from "./crypto/profile";
import { shapeOf, type Shape } from "./avatar/params";
import { loadIdentity } from "./keystore";
import type { Style } from "./style";

export type Me = { identity: Identity; style: Style; id: string; shape: Shape };

export async function meFromSeed(seed: Uint8Array, style: Style): Promise<Me> {
  const identity = await identityFromSeed(seed);
  return { identity, style, id: fingerprintId(identity.pub), shape: shapeOf(fingerprint(identity.pub), style) };
}

/** This device's identity, or null if none has been forged or restored here. */
export async function loadMe(): Promise<Me | null> {
  const saved = await loadIdentity();
  return saved ? meFromSeed(saved.seed, saved.style) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Request failed (" + res.status + ")");
  return body as T;
}

export async function publishProfile(me: Me): Promise<void> {
  await api("/api/profile", { method: "PUT", body: JSON.stringify({ profile: makeProfile(me.identity, me.style) }) });
}

/** Fetches a profile and checks it in this browser (signature, and keys match the id). */
export async function fetchProfile(id: string): Promise<VerifiedProfile> {
  const { profile } = await api<{ profile: unknown }>("/api/profile/" + encodeURIComponent(id));
  const v = verifyProfile(profile, id);
  if (!v) throw new Error("This profile failed its signature check. Don't trust it.");
  return v;
}

export function profileShape(p: { pub: PublicKeys; style: Style }): Shape {
  return shapeOf(fingerprint(p.pub), p.style);
}

export async function sendLetter(me: Me, to: PublicKeys, text: string, ttlDays: 1 | 7 | 30, burn: boolean): Promise<string> {
  const sealed = await sealLetter({ text, from: me.identity, fromStyle: me.style, to, burn });
  const { id } = await api<{ id: string }>("/api/drop", {
    method: "POST",
    body: JSON.stringify({ blob: toB64url(sealed.blob), deleteHash: toB64url(sealed.deleteHash), ttlDays }),
  });
  return id;
}

export type Fetched = { blob: Uint8Array; expiresAt: number };

export async function fetchDrop(id: string): Promise<Fetched> {
  const r = await api<{ blob: string; expiresAt: number }>("/api/drop/" + encodeURIComponent(id));
  return { blob: fromB64url(r.blob), expiresAt: r.expiresAt };
}

export async function readLetter(blob: Uint8Array, me: Me): Promise<OpenedLetter | null> {
  try {
    return await openLetter(blob, me.identity);
  } catch {
    return null;
  }
}

export async function burn(id: string, token: Uint8Array): Promise<void> {
  await api("/api/drop/" + encodeURIComponent(id), { method: "DELETE", body: JSON.stringify({ token: toB64url(token) }) });
}

export function absolute(path: string): string {
  return location.origin + path;
}

/** Phone share sheet when there is one, otherwise copy. Returns what happened. */
export async function shareOrCopy(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try { await navigator.share({ title, url }); return "shared"; } catch { /* closed or unavailable: fall back */ }
  }
  return copy(url);
}

export async function copy(text: string): Promise<"copied" | "failed"> {
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "failed"; }
}

export function downloadText(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
