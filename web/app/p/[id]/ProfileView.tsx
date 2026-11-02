"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarStage } from "@/components/AvatarStage";
import { Btn, Header, L, Panel } from "@/components/ui";
import { utf8 } from "@/lib/crypto/encoding";
import { formatFingerprint } from "@/lib/crypto/identity";
import { MAX_TEXT_BYTES } from "@/lib/crypto/letter";
import type { VerifiedProfile } from "@/lib/crypto/profile";
import { absolute, fetchProfile, loadMe, profileShape, sendLetter, shareOrCopy, type Me } from "@/lib/client";

const SHARE_NOTE = { shared: "SHARED.", copied: "LINK COPIED. PASTE IT ANYWHERE.", failed: "COULDN'T COPY. SELECT THE LINK ABOVE." };

export function ProfileView({ id }: { id: string }) {
  const [them, setThem] = useState<VerifiedProfile | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState<1 | 7 | 30>(7);
  const [burnAfter, setBurnAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetchProfile(id).then(setThem).catch((e) => setError((e as Error).message.toUpperCase()));
    loadMe().then(setMe).catch(() => setMe(null));
  }, [id]);

  const shape = useMemo(() => (them ? profileShape(them) : null), [them]);
  const bytes = utf8(text).length;
  const isMe = me && them && me.id === them.id;

  async function send() {
    if (!me || !them) return;
    setBusy(true); setError("");
    try {
      const dropId = await sendLetter(me, them.pub, text, ttl, burnAfter);
      setSent(absolute("/m/" + dropId));
      setText("");
    } catch (e) {
      setError((e as Error).message.toUpperCase());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AvatarStage shape={shape} />
      <Panel>
        <Header sub="PROFILE" />
        {!them && !error && <L className="dim">CHECKING SIGNATURE…</L>}
        {error && !them && <L className="wrap"><span className="tag bad">{error}</span></L>}
        {them && (
          <>
            <L><span>ID</span><span className="val plain">{formatFingerprint(them.id)}</span></L>
            <L><span className="tag go">SIGNATURE OK</span>{isMe && <span className="dim">THIS IS YOU</span>}</L>
            <L className="wrap dim small">COMPARE THE ID WITH THEM IN PERSON OR ON A CALL TO BE SURE IT&apos;S REALLY THEIRS.</L>
            <L />
            {sent ? (
              <>
                <L><span className="tag">LOCKED AND SENT</span></L>
                <L className="wrap break">{sent}</L>
                <L><Btn go onClick={async () => setNote(SHARE_NOTE[await shareOrCopy(sent, "A locked message for you")])}>SHARE LINK</Btn>
                  <Btn onClick={() => { setSent(""); setNote(""); }}>WRITE ANOTHER</Btn></L>
                {note && <L className="dim">{note}</L>}
                <L className="wrap dim small">SEND THIS LINK ANY WAY YOU LIKE. ONLY THEIR KEY CAN OPEN IT; THE SERVER SEES SCRAMBLED BYTES.</L>
              </>
            ) : me === null ? (
              <>
                <L className="wrap dim">TO WRITE, FORGE YOUR OWN KEY FIRST. MESSAGES ARE SIGNED SO THEY KNOW IT&apos;S YOU.</L>
                <L><Link href="/" className="tag">FORGE KEY →</Link></L>
              </>
            ) : (
              <>
                <L><span>WRITE</span><span className={"val small " + (bytes > MAX_TEXT_BYTES ? "" : "dim")}>{bytes}/{MAX_TEXT_BYTES}</span></L>
                <L className="wrap"><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" placeholder="Only they can read this." /></L>
                <L><span>EXPIRES</span><span className="row">
                  {([1, 7, 30] as const).map((d) => <Btn key={d} on={ttl === d} onClick={() => setTtl(d)}>{d}D</Btn>)}
                </span></L>
                <L><Btn on={burnAfter} onClick={() => setBurnAfter(!burnAfter)}>BURN AFTER READING: {burnAfter ? "ON" : "OFF"}</Btn></L>
                <L />
                <L><Btn go onClick={send} disabled={busy || !me || bytes === 0 || bytes > MAX_TEXT_BYTES}>{busy ? "LOCKING…" : "LOCK & SEND"}</Btn></L>
                {error && <L className="wrap"><span className="tag bad">{error}</span></L>}
              </>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
