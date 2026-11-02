// Everything needed to draw an avatar. The spike layout (seed + count) comes from
// the key's fingerprint, so only the key's owner can have that exact layout; the
// look (style) is chosen by the owner.

import type { Style } from "../style";

export type Shape = Style & { seed: number; count: number };

export const MIN_SPIKES = 12;
export const MAX_SPIKES = 56;

export function layoutFromFingerprint(fp: Uint8Array): { seed: number; count: number } {
  if (fp.length < 5) throw new Error("fingerprint too short");
  const seed = new DataView(fp.buffer, fp.byteOffset, 4).getUint32(0);
  return { seed, count: MIN_SPIKES + (fp[4] % (MAX_SPIKES - MIN_SPIKES + 1)) };
}

export function shapeOf(fp: Uint8Array, style: Style): Shape {
  return { ...style, ...layoutFromFingerprint(fp) };
}

/** Small seeded random generator, so a seed always gives the same spike layout. */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spike directions: evenly spread points on a sphere (Fibonacci), jittered by the seed. */
export function spikeDirections(n: number, seed: number): [number, number, number][] {
  const rand = mulberry32(seed);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 1 : 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const v = [Math.cos(th) * r + (rand() - 0.5) * 0.35, y + (rand() - 0.5) * 0.35, Math.sin(th) * r + (rand() - 0.5) * 0.35];
    const len = Math.hypot(v[0], v[1], v[2]);
    out.push([v[0] / len, v[1] / len, v[2] / len]);
  }
  return out;
}
