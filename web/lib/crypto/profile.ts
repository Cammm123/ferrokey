// A profile is what /p/<id> shows: public keys + chosen style, signed by those keys.
// The server checks it before storing; every browser checks it again after fetching,
// including that the keys hash to the id in the link, so the server can't swap them.

import { parseStyle, styleText, type Style } from "../style";
import { frame, fromB64url, toB64url, utf8 } from "./encoding";
import { decodePublic, encodePublic, fingerprintId, type Identity, type PublicKeys } from "./identity";
import { sign, verify } from "./sign";

export type ProfileRecord = { v: 1; pub: string; style: Style; updatedAt: number; sig: string };

export type VerifiedProfile = { id: string; pub: PublicKeys; style: Style; updatedAt: number };

function signedBytes(pub: Uint8Array, style: Style, updatedAt: number): Uint8Array {
  return frame(pub, utf8(styleText(style)), utf8(String(updatedAt)));
}

export function makeProfile(me: Identity, style: Style, updatedAt = Date.now()): ProfileRecord {
  const pub = encodePublic(me.pub);
  const s = parseStyle(style);
  return { v: 1, pub: toB64url(pub), style: s, updatedAt, sig: toB64url(sign(me, "profile", signedBytes(pub, s, updatedAt))) };
}

/** Returns the checked profile, or null if anything is off (or the id doesn't match). */
export function verifyProfile(rec: unknown, expectedId?: string): VerifiedProfile | null {
  try {
    const r = rec as ProfileRecord;
    if (r.v !== 1 || typeof r.pub !== "string" || typeof r.sig !== "string" || !Number.isSafeInteger(r.updatedAt)) return null;
    const pubBytes = fromB64url(r.pub);
    const pub = decodePublic(pubBytes);
    const style = parseStyle(r.style);
    if (!verify(pub, "profile", signedBytes(pubBytes, style, r.updatedAt), fromB64url(r.sig))) return null;
    const id = fingerprintId(pub);
    if (expectedId !== undefined && id !== expectedId) return null;
    return { id, pub, style, updatedAt: r.updatedAt };
  } catch {
    return null;
  }
}
