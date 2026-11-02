// A ferrokey identity: one 32-byte secret seed, from which three key pairs are derived.
//   - X-Wing (ML-KEM-768 + X25519) for receiving locked messages (HPKE)
//   - ML-DSA-65 and Ed25519 for signing, used together as a hybrid pair
// Only the seed is ever stored or backed up; the keys are re-derived from it.

import { Aes256Gcm, CipherSuite, HkdfSha256 } from "@hpke/core";
import { XWing } from "@hpke/hybridkem-x-wing";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { frame, randomBytes, toB32, unframe, utf8 } from "./encoding";

export const SEED_BYTES = 32;
const PUBLIC_VERSION = 1;

export type PublicKeys = { kem: Uint8Array; dsa: Uint8Array; ed: Uint8Array };

export type Identity = {
  seed: Uint8Array;
  pub: PublicKeys;
  kemPrivate: CryptoKey;
  dsaSecret: Uint8Array;
  edSecret: Uint8Array;
};

export function suite(): CipherSuite {
  return new CipherSuite({ kem: new XWing(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
}

export function newSeed(): Uint8Array {
  return randomBytes(SEED_BYTES);
}

function subSeed(seed: Uint8Array, label: string): Uint8Array {
  return hkdf(sha256, seed, utf8("ferrokey-seed-v1"), utf8(label), 32);
}

/** Re-derive every key pair from the seed. Same seed, same keys. */
export async function identityFromSeed(seed: Uint8Array): Promise<Identity> {
  if (seed.length !== SEED_BYTES) throw new Error("seed must be 32 bytes");
  const s = suite();
  const kp = await s.kem.deriveKeyPair(subSeed(seed, "kem"));
  const kem = new Uint8Array(await s.kem.serializePublicKey(kp.publicKey));
  const dsa = ml_dsa65.keygen(subSeed(seed, "ml-dsa-65"));
  const ed = ed25519.keygen(subSeed(seed, "ed25519"));
  return {
    seed,
    pub: { kem, dsa: dsa.publicKey, ed: ed.publicKey },
    kemPrivate: kp.privateKey,
    dsaSecret: dsa.secretKey,
    edSecret: ed.secretKey,
  };
}

/** Public keys as bytes: [version][framed kem, dsa, ed]. */
export function encodePublic(pub: PublicKeys): Uint8Array {
  const body = frame(pub.kem, pub.dsa, pub.ed);
  const out = new Uint8Array(1 + body.length);
  out[0] = PUBLIC_VERSION;
  out.set(body, 1);
  return out;
}

export function decodePublic(b: Uint8Array): PublicKeys {
  if (b[0] !== PUBLIC_VERSION) throw new Error("unknown public key version");
  const [kem, dsa, ed] = unframe(b.subarray(1), 3);
  if (kem.length !== 1216 || dsa.length !== 1952 || ed.length !== 32) throw new Error("bad public key sizes");
  return { kem, dsa, ed };
}

/** 32-byte fingerprint of the public keys. Everything identity-related hangs off this. */
export function fingerprint(pub: PublicKeys): Uint8Array {
  return sha256(frame(utf8("ferrokey-fingerprint-v1"), encodePublic(pub)));
}

/** First 128 bits of the fingerprint as 26 base32 characters: used in profile links. */
export function fingerprintId(pub: PublicKeys): string {
  return toB32(fingerprint(pub).subarray(0, 16)).slice(0, 26);
}

/** The id split into readable groups, e.g. "k3x9a-..." for comparing out loud. */
export function formatFingerprint(id: string): string {
  return id.match(/.{1,5}/g)!.join("-");
}
