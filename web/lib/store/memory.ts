import type { ProfileRecord } from "../crypto/profile";
import type { DropRow, Store } from "./types";

/** In-memory store for local development and tests. Everything resets on restart. */
export class MemoryStore implements Store {
  drops = new Map<string, DropRow>();
  profiles = new Map<string, ProfileRecord>();
  hits = new Map<string, number>();

  async putDrop(row: DropRow): Promise<void> {
    if (this.drops.has(row.id)) throw new Error("duplicate drop id");
    this.drops.set(row.id, { ...row });
  }

  async getDrop(id: string, now: number): Promise<DropRow | null> {
    const row = this.drops.get(id);
    return row && row.expiresAt > now ? { ...row } : null;
  }

  async deleteDrop(id: string, deleteHash: string): Promise<boolean> {
    const row = this.drops.get(id);
    if (!row || row.deleteHash !== deleteHash) return false;
    return this.drops.delete(id);
  }

  async putProfile(id: string, record: ProfileRecord): Promise<boolean> {
    const old = this.profiles.get(id);
    if (old && old.updatedAt >= record.updatedAt) return false;
    this.profiles.set(id, record);
    return true;
  }

  async getProfile(id: string): Promise<ProfileRecord | null> {
    return this.profiles.get(id) ?? null;
  }

  async hit(key: string, windowStart: number): Promise<number> {
    const k = key + "@" + windowStart;
    const n = (this.hits.get(k) ?? 0) + 1;
    this.hits.set(k, n);
    return n;
  }
}
