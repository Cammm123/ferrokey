"use client";

import { useEffect, useRef } from "react";
import type { Shape } from "@/lib/avatar/params";
import type { Ferrofluid } from "@/lib/avatar/ferrofluid";

/**
 * Full-screen ferrofluid behind the panel. On desktop the blob sits to the right
 * of the panel; on a phone the stage is the top half of the screen.
 */
export function AvatarStage({ shape, magnet = false, interactive = true }: { shape: Shape | null; magnet?: boolean; interactive?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const ff = useRef<Ferrofluid | null>(null);
  const latest = useRef({ shape, magnet });
  latest.current = { shape, magnet };

  useEffect(() => {
    let cancelled = false;
    // three.js is loaded only in the browser, after the page is up.
    import("@/lib/avatar/ferrofluid").then(({ Ferrofluid }) => {
      if (cancelled || !box.current) return;
      ff.current = new Ferrofluid(box.current, {
        interactive,
        offset: () => (window.innerWidth > 600 ? { x: 190, y: 0 } : { x: 0, y: 0 }),
      });
      if (latest.current.shape) ff.current.setShape(latest.current.shape);
      ff.current.setMagnet(latest.current.magnet);
    });
    return () => { cancelled = true; ff.current?.dispose(); ff.current = null; };
  }, [interactive]);

  useEffect(() => { if (shape) ff.current?.setShape(shape); }, [shape]);
  useEffect(() => { ff.current?.setMagnet(magnet); }, [magnet]);

  return <div ref={box} className="stage" aria-hidden="true" />;
}
