// Keeps this device's identity in IndexedDB. The seed is stored encrypted under a
// non-extractable AES key that lives in the same database: page code can use that
// key but can't read its bytes, so the raw seed never sits in storage.

import { parseStyle, type Style } from "./style";
import { randomBytes } from "./crypto/encoding";

type Stored = { iv: Uint8Array; ct: Uint8Array; style: Style; createdAt: number };

const STORE = "kv";

/**
 * Dev only: `?slot=b` gives this tab its own identity, so two identities can be
 * tested side by side. The slot sticks for the tab (sessionStorage).
 */
export function dbName(): string {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return "ferrokey";
  try {
    const fromUrl = new URLSearchParams(location.search).get("slot");
    if (fromUrl && /^[a-z]{1,8}$/.test(fromUrl)) sessionStorage.setItem("ferrokey-slot", fromUrl);
    const slot = sessionStorage.getItem("ferrokey-slot");
    return slot ? "ferrokey-" + slot : "ferrokey";
  } catch {
    return "ferrokey";
  }
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
    tx.onerror = () => reject(tx.error);
  });
}

async function wrapKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await run<CryptoKey | undefined>(db, "readonly", (s) => s.get("wrap"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await run(db, "readwrite", (s) => { s.put(key, "wrap"); });
  return key;
}

export async function saveIdentity(seed: Uint8Array, style: Style, name = dbName()): Promise<void> {
  const db = await openDb(name);
  try {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await wrapKey(db), seed as BufferSource));
    const rec: Stored = { iv, ct, style: parseStyle(style), createdAt: Date.now() };
    await run(db, "readwrite", (s) => { s.put(rec, "me"); });
  } finally {
    db.close();
  }
}

export async function loadIdentity(name = dbName()): Promise<{ seed: Uint8Array; style: Style } | null> {
  const db = await openDb(name);
  try {
    const rec = await run<Stored | undefined>(db, "readonly", (s) => s.get("me"));
    if (!rec) return null;
    const seed = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv as BufferSource }, await wrapKey(db), rec.ct as BufferSource));
    return { seed, style: parseStyle(rec.style) };
  } finally {
    db.close();
  }
}

export async function saveStyle(style: Style, name = dbName()): Promise<void> {
  const db = await openDb(name);
  try {
    const rec = await run<Stored | undefined>(db, "readonly", (s) => s.get("me"));
    if (!rec) throw new Error("no identity on this device");
    await run(db, "readwrite", (s) => { s.put({ ...rec, style: parseStyle(style) }, "me"); });
  } finally {
    db.close();
  }
}

/** Removes the identity and its wrapping key from this device. */
export async function forgetIdentity(name = dbName()): Promise<void> {
  const db = await openDb(name);
  try {
    await run(db, "readwrite", (s) => { s.clear(); });
  } finally {
    db.close();
  }
}
