import { describe, expect, it } from "vitest";
import { randomBytes, toB64url } from "@/lib/crypto/encoding";
import { fingerprintId, identityFromSeed, newSeed } from "@/lib/crypto/identity";
import { deleteHashOf } from "@/lib/crypto/letter";
import { makeProfile } from "@/lib/crypto/profile";
import { burnDrop, createDrop, ipKey, LIMITS, readDrop, readProfile, saveProfile } from "@/lib/server/api";
import { MemoryStore } from "@/lib/store";
import { DEFAULT_STYLE } from "@/lib/style";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function dropBody(ttlDays = 7) {
  const token = randomBytes(32);
  return { token, body: { blob: toB64url(randomBytes(500)), deleteHash: toB64url(deleteHashOf(token)), ttlDays } };
}

describe("drops", () => {
  it("store, read back and expire", async () => {
    const store = new MemoryStore();
    const { body } = dropBody(1);
    const made = await createDrop(store, body, "1.2.3.4", NOW);
    expect(made.status).toBe(201);
    const { id } = made.body as { id: string };
    expect(id).toMatch(/^[a-km-np-z2-9]{26}$/);
    expect((await readDrop(store, id, NOW + 1000)).body).toEqual({ blob: body.blob, expiresAt: NOW + DAY });
    expect((await readDrop(store, id, NOW + DAY + 1)).status).toBe(404);
  });
  it("reject bad input", async () => {
    const store = new MemoryStore();
    const { body } = dropBody();
    expect((await createDrop(store, null, "ip", NOW)).status).toBe(400);
    expect((await createDrop(store, { ...body, ttlDays: 365 }, "ip", NOW)).status).toBe(400);
    expect((await createDrop(store, { ...body, deleteHash: "abc" }, "ip", NOW)).status).toBe(400);
    expect((await createDrop(store, { ...body, blob: toB64url(new Uint8Array(64 * 1024 + 1).fill(7)) }, "ip", NOW)).status).toBe(400);
    expect((await createDrop(store, { ...body, blob: "not base64!" }, "ip", NOW)).status).toBe(400);
    expect((await readDrop(store, "../../etc", NOW)).status).toBe(404);
  });
  it("burn only with the right token", async () => {
    const store = new MemoryStore();
    const { token, body } = dropBody();
    const { id } = (await createDrop(store, body, "ip", NOW)).body as { id: string };
    expect((await burnDrop(store, id, { token: toB64url(randomBytes(32)) })).status).toBe(404);
    expect((await readDrop(store, id, NOW)).status).toBe(200);
    expect((await burnDrop(store, id, { token: toB64url(token) })).status).toBe(200);
    expect((await readDrop(store, id, NOW)).status).toBe(404);
  });
  it("rate-limit per network per hour", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < LIMITS.drop; i++) expect((await createDrop(store, dropBody().body, "9.9.9.9", NOW)).status).toBe(201);
    expect((await createDrop(store, dropBody().body, "9.9.9.9", NOW)).status).toBe(429);
    expect((await createDrop(store, dropBody().body, "8.8.8.8", NOW)).status).toBe(201);
    expect((await createDrop(store, dropBody().body, "9.9.9.9", NOW + 3600_000)).status).toBe(201);
  });
  it("never store the raw IP", () => {
    expect(ipKey("9.9.9.9")).not.toContain("9.9.9.9");
    expect(ipKey("9.9.9.9")).not.toBe(ipKey("9.9.9.8"));
  });
});

describe("profiles", () => {
  it("save and read back under the key's id", async () => {
    const store = new MemoryStore();
    const me = await identityFromSeed(newSeed());
    const rec = makeProfile(me, DEFAULT_STYLE, NOW);
    const saved = await saveProfile(store, { profile: rec }, "ip", NOW);
    expect(saved).toEqual({ status: 200, body: { id: fingerprintId(me.pub) } });
    expect((await readProfile(store, fingerprintId(me.pub))).body).toEqual({ profile: rec });
  });
  it("reject forged, replayed-old and future-dated profiles", async () => {
    const store = new MemoryStore();
    const me = await identityFromSeed(newSeed());
    const rec = makeProfile(me, DEFAULT_STYLE, NOW);
    const forged = { ...rec, style: { ...rec.style, color: "#ff0000" } };
    expect((await saveProfile(store, { profile: forged }, "ip", NOW)).status).toBe(400);
    await saveProfile(store, { profile: rec }, "ip", NOW);
    const older = makeProfile(me, { ...DEFAULT_STYLE, color: "#00ff00" }, NOW - 1000);
    expect((await saveProfile(store, { profile: older }, "ip", NOW)).status).toBe(409);
    const future = makeProfile(me, DEFAULT_STYLE, NOW + 3600_000);
    expect((await saveProfile(store, { profile: future }, "ip", NOW)).status).toBe(400);
  });
});
