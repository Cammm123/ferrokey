// The part of an avatar its owner chooses. The spike layout is not here: it comes
// from the key's fingerprint (see lib/avatar/params.ts), so it can't be copied.

export type Style = {
  color: string; // "#rrggbb"
  length: number; // 0..1 each
  sharp: number;
  width: number;
  focus: number;
  visc: number;
};

export const STYLE_KEYS = ["length", "sharp", "width", "focus", "visc"] as const;

export const DEFAULT_STYLE: Style = { color: "#15151c", length: 0.55, sharp: 0.6, width: 0.45, focus: 0.5, visc: 0.4 };

/** Checks and normalizes untrusted input (2 decimal places, fixed key order). Throws if invalid. */
export function parseStyle(x: unknown): Style {
  if (typeof x !== "object" || x === null) throw new Error("bad style");
  const o = x as Record<string, unknown>;
  if (typeof o.color !== "string" || !/^#[0-9a-f]{6}$/i.test(o.color)) throw new Error("bad style color");
  const out: Style = { color: o.color.toLowerCase(), length: 0, sharp: 0, width: 0, focus: 0, visc: 0 };
  for (const k of STYLE_KEYS) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw new Error("bad style " + k);
    out[k] = Math.round(v * 100) / 100;
  }
  return out;
}

/** Canonical text form, used inside signatures. */
export function styleText(s: Style): string {
  const n = parseStyle(s);
  return JSON.stringify([n.color, n.length, n.sharp, n.width, n.focus, n.visc]);
}

export function randomStyle(rand: () => number = Math.random): Style {
  const r2 = () => Math.round(rand() * 100) / 100;
  const h = rand(), s = 0.45 + rand() * 0.45, l = 0.08 + rand() * 0.3;
  return { color: hslHex(h, s, l), length: r2(), sharp: r2(), width: r2(), focus: r2(), visc: r2() };
}

function hslHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}
