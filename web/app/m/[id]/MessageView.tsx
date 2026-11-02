"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarStage } from "@/components/AvatarStage";
import { Header, L, Panel } from "@/components/ui";
import { formatFingerprint } from "@/lib/crypto/identity";
import type { OpenedLetter } from "@/lib/crypto/letter";
import { burn, fetchDrop, loadMe, profileShape, readLetter } from "@/lib/client";

type State =
  | { kind: "loading" }
  | { kind: "gone"; why: string }
  | { kind: "no-key" }
  | { kind: "not-yours" }
  | { kind: "open"; letter: OpenedLetter; expiresAt: number; burned: boolean | null };

export function MessageView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      let drop;
      try { drop = await fetchDrop(id); } catch (e) { return setState({ kind: "gone", why: (e as Error).message.toUpperCase() }); }
      const me = await loadMe().catch(() => null);
      if (!me) return setState({ kind: "no-key" });
      const letter = await readLetter(drop.blob, me);
      if (!letter) return setState({ kind: "not-yours" });
      setState({ kind: "open", letter, expiresAt: drop.expiresAt, burned: letter.burn ? null : false });
      if (letter.burn) {
        burn(id, letter.deleteToken)
          .then(() => setState((s) => (s.kind === "open" ? { ...s, burned: true } : s)))
          .catch(() => setState((s) => (s.kind === "open" ? { ...s, burned: false } : s)));
      }
    })();
  }, [id]);

  const shape = useMemo(() => (state.kind === "open" ? profileShape({ pub: state.letter.sender, style: state.letter.senderStyle }) : null), [state]);

  return (
    <>
      <AvatarStage shape={shape} interactive={false} />
      <Panel>
        <Header sub="MESSAGE" />
        {state.kind === "loading" && <L className="dim">UNLOCKING…</L>}
        {state.kind === "gone" && <L className="wrap"><span className="tag bad">{state.why}</span></L>}
        {state.kind === "no-key" && (
          <>
            <L className="wrap">THERE&apos;S NO KEY IN THIS BROWSER.</L>
            <L className="wrap dim small">OPEN THIS LINK ON THE DEVICE THAT HOLDS YOUR KEY, OR RESTORE YOUR BACKUP HERE FIRST.</L>
            <L><Link href="/" className="tag">FORGE OR RESTORE →</Link></L>
          </>
        )}
        {state.kind === "not-yours" && (
          <>
            <L><span className="tag bad">NOT FOR THIS KEY</span></L>
            <L className="wrap dim small">THIS MESSAGE WAS LOCKED TO SOMEONE ELSE, OR IT WAS DAMAGED. NOTHING IN IT CAN BE READ HERE.</L>
          </>
        )}
        {state.kind === "open" && (
          <>
            <L><span>FROM</span><span className="val plain">{formatFingerprint(state.letter.senderId)}</span></L>
            <L><span className="tag go">SIGNATURE OK</span><span className="dim small">{new Date(state.letter.sentAt).toLocaleString()}</span></L>
            <L />
            <L className="wrap letter">{state.letter.text}</L>
            <L />
            <L><Link href={"/p/" + state.letter.senderId} className="tag">REPLY →</Link></L>
            <L className="wrap dim small">
              {state.burned === true ? "BURNED: THIS MESSAGE IS DELETED FROM THE SERVER. COPY IT NOW IF YOU NEED IT."
                : state.burned === null ? "BURNING…"
                : state.letter.burn ? "COULDN'T BURN IT YET. IT STILL EXPIRES " + new Date(state.expiresAt).toLocaleDateString() + "."
                : "EXPIRES " + new Date(state.expiresAt).toLocaleDateString() + "."}
            </L>
          </>
        )}
      </Panel>
    </>
  );
}
