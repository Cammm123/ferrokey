import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { makeBackup, openBackup, passphraseProblem } from "@/lib/crypto/backup";
import { newSeed } from "@/lib/crypto/identity";
import { forgetIdentity, loadIdentity, saveIdentity, saveStyle } from "@/lib/keystore";
import { DEFAULT_STYLE } from "@/lib/style";

// Small Argon2 settings so tests stay fast; the format and checks are the same.
const FAST = { t: 1, m: 64, p: 1 };

describe("backup file", () => {
  it("round-trips with the right passphrase", async () => {
    const seed = newSeed();
    const file = await makeBackup(seed, DEFAULT_STYLE, "correct horse battery staple", FAST);
    expect(file).not.toContain("correct");
    const back = await openBackup(file, "correct horse battery staple");
    expect(back.seed).toEqual(seed);
    expect(back.style).toEqual(DEFAULT_STYLE);
  });
  it("fails with the wrong passphrase or an edited file", async () => {
    const file = await makeBackup(newSeed(), DEFAULT_STYLE, "correct horse battery staple", FAST);
    await expect(openBackup(file, "correct horse battery stapler")).rejects.toThrow("wrong passphrase");
    const edited = JSON.parse(file); edited.kdf.t = 2;
    await expect(openBackup(JSON.stringify(edited), "correct horse battery staple")).rejects.toThrow("wrong passphrase");
    await expect(openBackup("{}", "x")).rejects.toThrow("not a ferrokey backup");
  });
  it("uses strong default Argon2 settings", async () => {
    const { DEFAULT_KDF } = await import("@/lib/crypto/backup");
    expect(DEFAULT_KDF.m).toBeGreaterThanOrEqual(64 * 1024);
    expect(DEFAULT_KDF.t).toBeGreaterThanOrEqual(3);
  });
  it("rejects weak passphrases", () => {
    expect(passphraseProblem("hunter2")).not.toBeNull();
    expect(passphraseProblem("tiny red fox jumps")).toBeNull();
    expect(passphraseProblem("averylongpassword")).toBeNull();
  });
});

describe("keystore", () => {
  it("saves, loads, restyles and forgets", async () => {
    const seed = newSeed();
    expect(await loadIdentity("t1")).toBeNull();
    await saveIdentity(seed, DEFAULT_STYLE, "t1");
    expect((await loadIdentity("t1"))?.seed).toEqual(seed);
    await saveStyle({ ...DEFAULT_STYLE, color: "#123456" }, "t1");
    expect((await loadIdentity("t1"))?.style.color).toBe("#123456");
    await forgetIdentity("t1");
    expect(await loadIdentity("t1")).toBeNull();
  });
  it("never stores the raw seed", async () => {
    const seed = newSeed();
    await saveIdentity(seed, DEFAULT_STYLE, "t2");
    const raw = await new Promise<{ ct: Uint8Array }>((resolve) => {
      const req = indexedDB.open("t2", 1);
      req.onsuccess = () => {
        const get = req.result.transaction("kv").objectStore("kv").get("me");
        get.onsuccess = () => { resolve(get.result); req.result.close(); };
      };
    });
    expect(Buffer.from(raw.ct).includes(Buffer.from(seed))).toBe(false);
  });
});
