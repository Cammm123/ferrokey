// Hybrid signatures: a message is accepted only if BOTH the ML-DSA-65 and the
// Ed25519 signatures check out, so it stays safe if either scheme is ever broken.
// Every signature is bound to a purpose label so one kind can't pass as another.

import { ed25519 } from "@noble/curves/ed25519.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { frame, unframe, utf8 } from "./encoding";
import type { Identity, PublicKeys } from "./identity";

export type Purpose = "letter" | "profile";

function labeled(purpose: Purpose, msg: Uint8Array): Uint8Array {
  return frame(utf8("ferrokey-sig-v1:" + purpose), msg);
}

export function sign(id: Identity, purpose: Purpose, msg: Uint8Array): Uint8Array {
  const m = labeled(purpose, msg);
  return frame(ml_dsa65.sign(m, id.dsaSecret), ed25519.sign(m, id.edSecret));
}

export function verify(pub: PublicKeys, purpose: Purpose, msg: Uint8Array, sig: Uint8Array): boolean {
  try {
    const [dsaSig, edSig] = unframe(sig, 2);
    const m = labeled(purpose, msg);
    return ml_dsa65.verify(dsaSig, m, pub.dsa) && ed25519.verify(edSig, m, pub.ed);
  } catch {
    return false;
  }
}
