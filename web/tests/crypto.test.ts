import { describe, expect, it } from "vitest";
import { fromB64url, frame, toB32, toB64url, unframe, utf8 } from "@/lib/crypto/encoding";
import { decodePublic, encodePublic, fingerprintId, formatFingerprint, identityFromSeed, newSeed } from "@/lib/crypto/identity";
import { deleteHashOf, openLetter, sealLetter } from "@/lib/crypto/letter";
import { makeProfile, verifyProfile } from "@/lib/crypto/profile";
import { sign, verify } from "@/lib/crypto/sign";
import { DEFAULT_STYLE } from "@/lib/style";

const fixedSeed = (n: number) => new Uint8Array(32).fill(n);

describe("encoding", () => {
  it("round-trips base64url and frames", () => {
    const b = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(fromB64url(toB64url(b))).toEqual(b);
    const parts = [utf8("a"), new Uint8Array(0), utf8("hello")];
    expect(unframe(frame(...parts), 3)).toEqual(parts);
  });
  it("rejects bad frames", () => {
    expect(() => unframe(frame(utf8("a")), 2)).toThrow();
    expect(() => unframe(new Uint8Array([0, 0, 0, 9, 1]), 1)).toThrow();
  });
  it("base32 has no ambiguous characters", () => {
    expect(toB32(new Uint8Array(16).fill(255))).toMatch(/^[a-km-np-z2-9]+$/);
  });
});

describe("identity", () => {
  it("is deterministic from the seed", async () => {
    const a = await identityFromSeed(fixedSeed(1));
    const b = await identityFromSeed(fixedSeed(1));
    const c = await identityFromSeed(fixedSeed(2));
    expect(encodePublic(a.pub)).toEqual(encodePublic(b.pub));
    expect(fingerprintId(a.pub)).toBe(fingerprintId(b.pub));
    expect(fingerprintId(a.pub)).not.toBe(fingerprintId(c.pub));
  });
  it("encodes public keys and fingerprints", async () => {
    const a = await identityFromSeed(newSeed());
    expect(decodePublic(encodePublic(a.pub))).toEqual(a.pub);
    const id = fingerprintId(a.pub);
    expect(id).toMatch(/^[a-km-np-z2-9]{26}$/);
    expect(formatFingerprint(id).split("-").map((g) => g.length)).toEqual([5, 5, 5, 5, 6]);
  });
  it("rejects malformed public keys", async () => {
    const a = await identityFromSeed(newSeed());
    const bytes = encodePublic(a.pub);
    expect(() => decodePublic(bytes.subarray(0, bytes.length - 1))).toThrow();
    expect(() => decodePublic(new Uint8Array([9, ...bytes.subarray(1)]))).toThrow();
  });
});

describe("signatures", () => {
  it("verify only for the right key, purpose and message", async () => {
    const a = await identityFromSeed(newSeed());
    const b = await identityFromSeed(newSeed());
    const sig = sign(a, "letter", utf8("hi"));
    expect(verify(a.pub, "letter", utf8("hi"), sig)).toBe(true);
    expect(verify(b.pub, "letter", utf8("hi"), sig)).toBe(false);
    expect(verify(a.pub, "profile", utf8("hi"), sig)).toBe(false);
    expect(verify(a.pub, "letter", utf8("ho"), sig)).toBe(false);
  });
  it("needs both halves of the hybrid signature", async () => {
    const a = await identityFromSeed(newSeed());
    const msg = utf8("hi");
    const [dsa, ed] = unframe(sign(a, "letter", msg), 2);
    const badEd = ed.slice(); badEd[0] ^= 1;
    const badDsa = dsa.slice(); badDsa[10] ^= 1;
    expect(verify(a.pub, "letter", msg, frame(dsa, badEd))).toBe(false);
    expect(verify(a.pub, "letter", msg, frame(badDsa, ed))).toBe(false);
  });
});

describe("letters", () => {
  it("round-trip and verify the sender", async () => {
    const alice = await identityFromSeed(newSeed());
    const bob = await identityFromSeed(newSeed());
    const sealed = await sealLetter({ text: "meet at 5 ✨", from: alice, fromStyle: DEFAULT_STYLE, to: bob.pub, burn: true, sentAt: 1234 });
    const opened = await openLetter(sealed.blob, bob);
    expect(opened.text).toBe("meet at 5 ✨");
    expect(opened.senderId).toBe(fingerprintId(alice.pub));
    expect(opened.senderStyle).toEqual(DEFAULT_STYLE);
    expect(opened.sentAt).toBe(1234);
    expect(opened.burn).toBe(true);
    expect(deleteHashOf(opened.deleteToken)).toEqual(sealed.deleteHash);
  });
  it("can't be opened by anyone else", async () => {
    const [alice, bob, eve] = await Promise.all([1, 2, 3].map(() => identityFromSeed(newSeed())));
    const sealed = await sealLetter({ text: "secret", from: alice, fromStyle: DEFAULT_STYLE, to: bob.pub, burn: false });
    await expect(openLetter(sealed.blob, eve)).rejects.toThrow();
  });
  it("fails if any byte is changed", async () => {
    const alice = await identityFromSeed(newSeed());
    const bob = await identityFromSeed(newSeed());
    const { blob } = await sealLetter({ text: "secret", from: alice, fromStyle: DEFAULT_STYLE, to: bob.pub, burn: false });
    for (const i of [0, 5, 100, 1200, blob.length - 1]) {
      const bad = blob.slice(); bad[i] ^= 1;
      await expect(openLetter(bad, bob)).rejects.toThrow();
    }
  });
  it("rejects a letter re-locked to someone else (recipient binding)", async () => {
    // Bob opens Alice's letter, then re-locks the same signed bundle to Carol.
    const [alice, bob, carol] = await Promise.all([1, 2, 3].map(() => identityFromSeed(newSeed())));
    const { blob } = await sealLetter({ text: "for bob only", from: alice, fromStyle: DEFAULT_STYLE, to: bob.pub, burn: false });
    const { suite } = await import("@/lib/crypto/identity");
    const s = suite();
    const [enc, ct] = unframe(blob.subarray(1), 2);
    const info = utf8("ferrokey-letter-v1");
    const rc = await s.createRecipientContext({ recipientKey: bob.kemPrivate, enc, info });
    const inner = await rc.open(ct, new Uint8Array([1]));
    const carolKey = await s.kem.deserializePublicKey(carol.pub.kem);
    const sc = await s.createSenderContext({ recipientPublicKey: carolKey, info });
    const resealed = await sc.seal(inner, new Uint8Array([1]));
    const forged = new Uint8Array([1, ...frame(new Uint8Array(sc.enc), new Uint8Array(resealed))]);
    await expect(openLetter(forged, carol)).rejects.toThrow("signature check failed");
  });
  it("rejects empty and oversized text", async () => {
    const a = await identityFromSeed(newSeed());
    await expect(sealLetter({ text: "", from: a, fromStyle: DEFAULT_STYLE, to: a.pub, burn: false })).rejects.toThrow();
    await expect(sealLetter({ text: "x".repeat(20_001), from: a, fromStyle: DEFAULT_STYLE, to: a.pub, burn: false })).rejects.toThrow();
  });
});

describe("profiles", () => {
  it("verify and match their id", async () => {
    const a = await identityFromSeed(newSeed());
    const rec = makeProfile(a, DEFAULT_STYLE, 99);
    const v = verifyProfile(rec, fingerprintId(a.pub));
    expect(v?.style).toEqual(DEFAULT_STYLE);
    expect(v?.updatedAt).toBe(99);
  });
  it("reject swapped keys, edited style and the wrong id", async () => {
    const a = await identityFromSeed(newSeed());
    const b = await identityFromSeed(newSeed());
    const rec = makeProfile(a, DEFAULT_STYLE);
    const other = makeProfile(b, DEFAULT_STYLE);
    expect(verifyProfile({ ...rec, pub: other.pub }, fingerprintId(a.pub))).toBeNull();
    expect(verifyProfile(other, fingerprintId(a.pub))).toBeNull();
    expect(verifyProfile({ ...rec, style: { ...rec.style, color: "#ff0000" } })).toBeNull();
    expect(verifyProfile({ ...rec, updatedAt: rec.updatedAt + 1 })).toBeNull();
    expect(verifyProfile("nonsense")).toBeNull();
  });
});
