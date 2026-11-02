// Byte helpers shared by the crypto modules: base64url, base32, UTF-8 and a
// simple length-prefixed framing for packing several fields into one byte array.

const B32 = "abcdefghijkmnpqrstuvwxyz23456789"; // no l, o, 0, 1: easy to read aloud

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function fromUtf8(b: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(b);
}

export function toB64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Base32 with a lowercase, unambiguous alphabet (5 bits per character). */
export function toB32(b: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of b) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function isB32(s: string, length: number): boolean {
  return s.length === length && [...s].every((c) => B32.includes(c));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Pack fields as [4-byte big-endian length][bytes] each. */
export function frame(...fields: Uint8Array[]): Uint8Array {
  return concat(...fields.flatMap((f) => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, f.length);
    return [len, f];
  }));
}

/** Inverse of frame(); throws unless exactly `count` fields fill the input. */
export function unframe(b: Uint8Array, count: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  while (o < b.length) {
    if (o + 4 > b.length) throw new Error("bad frame");
    const len = view.getUint32(o);
    o += 4;
    if (o + len > b.length) throw new Error("bad frame");
    out.push(b.slice(o, o + len));
    o += len;
  }
  if (out.length !== count) throw new Error("bad frame");
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
