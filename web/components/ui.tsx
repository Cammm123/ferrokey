"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { STYLE_KEYS, type Style } from "@/lib/style";

/** One numbered line of the panel. */
export function L({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={"ln " + className}>{children}</div>;
}

export function Panel({ children }: { children: ReactNode }) {
  return <main className="panel">{children}</main>;
}

export function Header({ sub }: { sub: string }) {
  return (
    <>
      <L><Link href="/" className="tag">FERROKEY</Link></L>
      <L className="dim">{sub}</L>
      <L />
    </>
  );
}

/** A bracketed text button: [LIKE THIS]. */
export function Btn({ children, onClick, on, go, disabled, label }: {
  children: ReactNode; onClick: () => void; on?: boolean; go?: boolean; disabled?: boolean; label?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} aria-label={label}
      className={(on ? "on " : "") + (go ? "go" : "")}>
      [{children}]
    </button>
  );
}

const STYLE_LABELS: Record<(typeof STYLE_KEYS)[number], string> = {
  length: "SPIKE LENGTH", sharp: "SHARPNESS", width: "SPIKE WIDTH", focus: "MAGNET FOCUS", visc: "THICKNESS",
};

/** The style sliders and color picker, as numbered lines. */
export function StyleEditor({ style, onChange }: { style: Style; onChange: (s: Style) => void }) {
  return (
    <>
      {STYLE_KEYS.map((k) => (
        <div key={k}>
          <L><span>{STYLE_LABELS[k]}</span><span className="val">{style[k].toFixed(2)}</span></L>
          <L>
            <input type="range" min={0} max={1} step={0.01} value={style[k]} aria-label={STYLE_LABELS[k]}
              onChange={(e) => onChange({ ...style, [k]: Number(e.target.value) })} />
          </L>
        </div>
      ))}
      <L><span>COLOR</span><span className="val">{style.color.toUpperCase()}</span></L>
      <L><input type="color" value={style.color} aria-label="Color" onChange={(e) => onChange({ ...style, color: e.target.value })} /></L>
    </>
  );
}
