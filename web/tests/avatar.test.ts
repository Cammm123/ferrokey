import { describe, expect, it } from "vitest";
import { fingerprint, identityFromSeed } from "@/lib/crypto/identity";
import { layoutFromFingerprint, MAX_SPIKES, MIN_SPIKES, shapeOf, spikeDirections } from "@/lib/avatar/params";
import { DEFAULT_STYLE, parseStyle, randomStyle } from "@/lib/style";

describe("avatar layout", () => {
  it("is fixed by the key", async () => {
    const a = await identityFromSeed(new Uint8Array(32).fill(1));
    const b = await identityFromSeed(new Uint8Array(32).fill(2));
    const la = layoutFromFingerprint(fingerprint(a.pub));
    expect(layoutFromFingerprint(fingerprint(a.pub))).toEqual(la);
    expect(layoutFromFingerprint(fingerprint(b.pub))).not.toEqual(la);
    expect(shapeOf(fingerprint(a.pub), DEFAULT_STYLE)).toMatchObject({ ...DEFAULT_STYLE, ...la });
  });
  it("keeps the spike count in range", () => {
    for (let x = 0; x < 256; x++) {
      const { count } = layoutFromFingerprint(new Uint8Array([1, 2, 3, 4, x]));
      expect(count).toBeGreaterThanOrEqual(MIN_SPIKES);
      expect(count).toBeLessThanOrEqual(MAX_SPIKES);
    }
  });
  it("makes the same unit-length spike directions for a seed", () => {
    const d = spikeDirections(30, 12345);
    expect(spikeDirections(30, 12345)).toEqual(d);
    for (const v of d) expect(Math.hypot(...v)).toBeCloseTo(1, 10);
  });
});

describe("style", () => {
  it("accepts random styles and rejects bad ones", () => {
    for (let i = 0; i < 50; i++) expect(() => parseStyle(randomStyle())).not.toThrow();
    expect(() => parseStyle({ ...DEFAULT_STYLE, color: "red" })).toThrow();
    expect(() => parseStyle({ ...DEFAULT_STYLE, length: 2 })).toThrow();
    expect(() => parseStyle({ ...DEFAULT_STYLE, visc: Number.NaN })).toThrow();
  });
});
