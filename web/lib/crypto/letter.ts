// Locking and unlocking a message ("letter").
//
// Sign, then lock: the sender signs the text together with the recipient's
// fingerprint, then the whole bundle (text, sender's public keys and style,
// signature, delete token) is locked to the recipient with HPKE (X-Wing).
// The server only ever sees the locked blob.

import { sha256 } from "@noble/hashes/sha2.js";
import { parseStyle, styleText, type Style } from "../style";
import { concat, equalBytes, frame, fromUtf8, randomBytes, unframe, utf8 } from "./encoding";
import { decodePublic, encodePublic, fingerprint, fingerprintId, suite, type Identity, type PublicKeys } from "./identity";
import { sign, verify } from "./sign";

const VERSION = 1;
const INFO = utf8("ferrokey-letter-v1");
export const MAX_TEXT_BYTES = 20_000;

export type Sealed = {
  blob: Uint8Array; // goes to the server
  deleteHash: Uint8Array; // goes to the server; only the recipient can produce its preimage
};

export type OpenedLetter = {
  text: string;
  sender: PublicKeys;
  senderId: string;
  senderStyle: Style;
  sentAt: number;
  burn: boolean;
  deleteToken: Uint8Array;
};

export function deleteHashOf(token: Uint8Array): Uint8Array {
  return sha256(concat(utf8("ferrokey-delete-v1"), token));
}

function signedBytes(recipientFp: Uint8Array, senderPub: Uint8Array, style: string, text: Uint8Array,
  token: Uint8Array, sentAt: string, burn: string): Uint8Array {
  return frame(recipientFp, senderPub, utf8(style), text, token, utf8(sentAt), utf8(burn));
}

export async function sealLetter(opts: {
  text: string; from: Identity; fromStyle: Style; to: PublicKeys; burn: boolean; sentAt?: number;
}): Promise<Sealed> {
  const text = utf8(opts.text);
  if (text.length === 0 || text.length > MAX_TEXT_BYTES) throw new Error("message must be 1 to 20,000 bytes");
  const senderPub = encodePublic(opts.from.pub);
  const style = styleText(opts.fromStyle);
  const token = randomBytes(32);
  const sentAt = String(opts.sentAt ?? Date.now());
  const burn = opts.burn ? "1" : "0";
  const sig = sign(opts.from, "letter", signedBytes(fingerprint(opts.to), senderPub, style, text, token, sentAt, burn));
  const inner = frame(senderPub, utf8(style), text, token, utf8(sentAt), utf8(burn), sig);

  const s = suite();
  const recipientKey = await s.kem.deserializePublicKey(opts.to.kem);
  // Context API on purpose: the one-shot suite.seal/open in @hpke/core 1.9.0 fails to round-trip.
  const ctx = await s.createSenderContext({ recipientPublicKey: recipientKey, info: INFO });
  const ciphertext = await ctx.seal(inner, new Uint8Array([VERSION]));
  const blob = concat(new Uint8Array([VERSION]), frame(new Uint8Array(ctx.enc), new Uint8Array(ciphertext)));
  return { blob, deleteHash: deleteHashOf(token) };
}

/** Unlocks and checks a letter. Throws if it isn't for `me` or anything fails to verify. */
export async function openLetter(blob: Uint8Array, me: Identity): Promise<OpenedLetter> {
  if (blob[0] !== VERSION) throw new Error("unknown letter version");
  const [enc, ct] = unframe(blob.subarray(1), 2);
  const s = suite();
  const ctx = await s.createRecipientContext({ recipientKey: me.kemPrivate, enc, info: INFO });
  const inner = new Uint8Array(await ctx.open(ct, new Uint8Array([VERSION])));
  const [senderPub, styleB, text, token, sentAtB, burnB, sig] = unframe(inner, 7);

  const sender = decodePublic(senderPub);
  const style = fromUtf8(styleB);
  const sentAt = fromUtf8(sentAtB);
  const burn = fromUtf8(burnB);
  const signed = signedBytes(fingerprint(me.pub), senderPub, style, text, token, sentAt, burn);
  if (!verify(sender, "letter", signed, sig)) throw new Error("signature check failed");

  const [color, length, sharp, width, focus, visc] = JSON.parse(style);
  const senderStyle = parseStyle({ color, length, sharp, width, focus, visc });
  if (!equalBytes(utf8(styleText(senderStyle)), styleB)) throw new Error("bad style encoding");
  if (!/^\d{1,15}$/.test(sentAt) || (burn !== "0" && burn !== "1")) throw new Error("bad letter fields");

  return {
    text: fromUtf8(text), sender, senderId: fingerprintId(sender), senderStyle,
    sentAt: Number(sentAt), burn: burn === "1", deleteToken: token,
  };
}
