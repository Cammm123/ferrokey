"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarStage } from "@/components/AvatarStage";
import { Btn, Header, L, Panel, StyleEditor } from "@/components/ui";
import { shapeOf } from "@/lib/avatar/params";
import { makeBackup, openBackup, passphraseProblem } from "@/lib/crypto/backup";
import { fingerprint, formatFingerprint, identityFromSeed, newSeed } from "@/lib/crypto/identity";
import { absolute, downloadText, loadMe, meFromSeed, publishProfile, shareOrCopy, type Me } from "@/lib/client";
import { forgetIdentity, saveIdentity, saveStyle } from "@/lib/keystore";
import { DEFAULT_STYLE, type Style } from "@/lib/style";

const SHARE_NOTE = { shared: "SHARED.", copied: "LINK COPIED. PASTE IT ANYWHERE.", failed: "COULDN'T COPY. SELECT THE LINK BELOW." };

type Mode = "loading" | "forge" | "restore" | "mine";

export default function Home() {
  const [mode, setMode] = useState<Mode>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMe().then((m) => { setMe(m); setMode(m ? "mine" : "forge"); }).catch(() => setError("This browser can't store keys (private mode?)."));
  }, []);

  const done = useCallback((m: Me) => { setMe(m); setMode("mine"); }, []);

  return (
    <>
      {mode === "forge" && <Forge onDone={done} onRestore={() => setMode("restore")} />}
      {mode === "restore" && <Restore onDone={done} onBack={() => setMode("forge")} />}
      {mode === "mine" && me && <Mine me={me} onChange={setMe} onForget={() => { setMe(null); setMode("forge"); }} />}
      {mode === "loading" && <Panel><Header sub={error || "LOADING…"} /></Panel>}
    </>
  );
}

function Forge({ onDone, onRestore }: { onDone: (m: Me) => void; onRestore: () => void }) {
  const [seed, setSeed] = useState<Uint8Array>(() => newSeed());
  const [layout, setLayout] = useState<{ seed: number; count: number } | null>(null);
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [magnet, setMagnet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The preview already uses the real key, so what you see is what you forge.
  useEffect(() => {
    let live = true;
    identityFromSeed(seed).then((id) => { if (live) setLayout(shapeOf(fingerprint(id.pub), DEFAULT_STYLE)); });
    return () => { live = false; };
  }, [seed]);

  const shape = useMemo(() => (layout ? { ...style, ...layout } : null), [layout, style]);

  async function forge() {
    setBusy(true); setError("");
    try {
      const m = await meFromSeed(seed, style);
      await saveIdentity(seed, style);
      await publishProfile(m);
      onDone(m);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <AvatarStage shape={shape} magnet={magnet} />
      <Panel>
        <Header sub="POST-QUANTUM MESSAGES. YOUR KEY HAS A SHAPE." />
        <L>1. SHAPE IT</L>
        <StyleEditor style={style} onChange={setStyle} />
        <L />
        <L><Btn on={magnet} onClick={() => setMagnet(!magnet)}>MAGNET: {magnet ? "ON" : "OFF"}</Btn>
          <Btn onClick={() => setSeed(newSeed())} label="New key, new spike layout">NEW LAYOUT</Btn></L>
        <L className="wrap dim small">THE SPIKE LAYOUT COMES FROM YOUR KEY, SO NOBODY ELSE CAN HAVE IT. NEW LAYOUT = NEW KEY.</L>
        <L />
        <L>2. <Btn go onClick={forge} disabled={busy || !layout}>{busy ? "FORGING…" : "FORGE KEY"}</Btn></L>
        {error && <L className="wrap"><span className="tag bad">{error}</span></L>}
        <L className="wrap dim small">YOUR KEY IS MADE AND KEPT IN THIS BROWSER. IT NEVER LEAVES THIS DEVICE.</L>
        <L />
        <L className="dim">HAVE A BACKUP? <Btn onClick={onRestore}>RESTORE</Btn></L>
      </Panel>
    </>
  );
}

function Restore({ onDone, onBack }: { onDone: (m: Me) => void; onBack: () => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const { seed, style } = await openBackup(file, pass);
      const m = await meFromSeed(seed, style);
      await saveIdentity(seed, style);
      await publishProfile(m).catch(() => undefined); // already published from the old device is fine
      onDone(m);
    } catch (e) {
      setError((e as Error).message.toUpperCase());
      setBusy(false);
    }
  }

  return (
    <>
      <AvatarStage shape={null} />
      <Panel>
        <Header sub="RESTORE FROM A BACKUP FILE" />
        <L>BACKUP FILE</L>
        <L><input type="file" accept=".json,application/json" aria-label="Backup file"
          onChange={async (e) => setFile(await e.target.files?.[0]?.text() ?? null)} /></L>
        <L>PASSPHRASE</L>
        <L><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" autoComplete="current-password" /></L>
        <L />
        <L><Btn go onClick={restore} disabled={busy || !file || !pass}>{busy ? "UNLOCKING…" : "RESTORE"}</Btn><Btn onClick={onBack}>BACK</Btn></L>
        {error && <L className="wrap"><span className="tag bad">{error}</span></L>}
      </Panel>
    </>
  );
}

function Mine({ me, onChange, onForget }: { me: Me; onChange: (m: Me) => void; onForget: () => void }) {
  const [magnet, setMagnet] = useState(false);
  const [open, setOpen] = useState<"" | "qr" | "style" | "backup" | "forget">("");
  const [note, setNote] = useState("");
  const [qr, setQr] = useState("");
  const [style, setStyle] = useState(me.style);
  const link = absolute("/p/" + me.id);

  useEffect(() => {
    if (open !== "qr") return;
    const dark = getComputedStyle(document.body).color;
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: rgbHex(dark), light: "#00000000" } }).then(setQr);
  }, [open, link]);

  const shape = useMemo(() => ({ ...me.shape, ...style }), [me.shape, style]);
  const toggle = (k: typeof open) => { setOpen(open === k ? "" : k); setNote(""); };

  async function saveNewStyle() {
    await saveStyle(style);
    const m = { ...me, style, shape };
    await publishProfile(m);
    onChange(m);
    setOpen(""); setNote("STYLE SAVED AND PUBLISHED.");
  }

  return (
    <>
      <AvatarStage shape={shape} magnet={magnet} />
      <Panel>
        <Header sub="YOUR KEY" />
        <L><span>ID</span><span className="val plain">{formatFingerprint(me.id)}</span></L>
        <L className="wrap dim small">SEND PEOPLE YOUR PROFILE LINK. ANYONE WITH IT CAN WRITE TO YOU; ONLY THIS KEY CAN READ IT.</L>
        <L />
        <L><Btn go onClick={async () => setNote(SHARE_NOTE[await shareOrCopy(link, "Write to me on ferrokey")])}>SHARE PROFILE</Btn>
          <Btn on={open === "qr"} onClick={() => toggle("qr")}>QR</Btn></L>
        <L className="wrap break dim">{link}</L>
        {open === "qr" && qr && <L className="wrap">{/* eslint-disable-next-line @next/next/no-img-element */}<img className="qr" src={qr} alt="QR code for your profile link" /></L>}
        {note && <L className="dim">{note}</L>}
        <L />
        <L><Btn on={magnet} onClick={() => setMagnet(!magnet)}>MAGNET: {magnet ? "ON" : "OFF"}</Btn>
          <Btn on={open === "style"} onClick={() => toggle("style")}>EDIT STYLE</Btn></L>
        {open === "style" && (
          <>
            <StyleEditor style={style} onChange={setStyle} />
            <L><Btn go onClick={saveNewStyle}>SAVE STYLE</Btn><Btn onClick={() => { setStyle(me.style); setOpen(""); }}>CANCEL</Btn></L>
          </>
        )}
        <L />
        <L><Btn on={open === "backup"} onClick={() => toggle("backup")}>BACKUP KEY</Btn>
          <Btn on={open === "forget"} onClick={() => toggle("forget")}>FORGET DEVICE</Btn></L>
        {open === "backup" && <Backup me={me} onDone={() => { setOpen(""); setNote("BACKUP DOWNLOADED. KEEP IT AND THE PASSPHRASE SAFE."); }} />}
        {open === "forget" && <Forget onForget={onForget} />}
      </Panel>
    </>
  );
}

function Backup({ me, onDone }: { me: Me; onDone: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = p1 ? passphraseProblem(p1) : null;

  async function make() {
    setBusy(true);
    try {
      downloadText("ferrokey-backup-" + me.id.slice(0, 5) + ".json", await makeBackup(me.identity.seed, me.style, p1));
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <L className="wrap dim small">YOUR KEY, LOCKED WITH A PASSPHRASE. LOSE BOTH THE DEVICE AND THIS FILE AND THE KEY IS GONE FOR GOOD.</L>
      <L>PASSPHRASE</L>
      <L><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} aria-label="Passphrase" autoComplete="new-password" /></L>
      <L>AGAIN</L>
      <L><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} aria-label="Repeat passphrase" autoComplete="new-password" /></L>
      {problem && <L className="wrap dim small">{problem.toUpperCase()}</L>}
      {p2 && p1 !== p2 && <L className="dim small">PASSPHRASES DON&apos;T MATCH.</L>}
      <L><Btn go onClick={make} disabled={busy || !p1 || !!problem || p1 !== p2}>{busy ? "LOCKING…" : "DOWNLOAD BACKUP"}</Btn></L>
    </>
  );
}

function Forget({ onForget }: { onForget: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <>
      <L className="wrap dim small">REMOVES YOUR KEY FROM THIS BROWSER. WITHOUT A BACKUP, MESSAGES TO IT CAN NEVER BE READ AGAIN. TYPE FORGET TO CONFIRM.</L>
      <L><input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type forget to confirm" /></L>
      <L><Btn onClick={async () => { await forgetIdentity(); onForget(); }} disabled={typed.trim().toLowerCase() !== "forget"}>FORGET THIS DEVICE</Btn></L>
    </>
  );
}

function rgbHex(rgb: string): string {
  const m = rgb.match(/\d+/g);
  return m ? "#" + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("") + "ff" : "#111111ff";
}
