import type { ProfileRecord } from "../crypto/profile";

export type DropRow = {
  id: string; // 26 base32 characters (128 random bits)
  blob: string; // base64url of the locked letter
  deleteHash: string; // base64url of sha256(label || delete token)
  expiresAt: number; // ms since epoch
};

/** Where drops, profiles and rate-limit counters live. Memory in dev, Supabase in production. */
export interface Store {
  putDrop(row: DropRow): Promise<void>;
  /** The drop, or null if missing or expired at `now`. */
  getDrop(id: string, now: number): Promise<DropRow | null>;
  /** Deletes only if the hash matches. True if something was deleted. */
  deleteDrop(id: string, deleteHash: string): Promise<boolean>;
  /** Saves unless a newer (or same-age) record is already stored. True if saved. */
  putProfile(id: string, record: ProfileRecord): Promise<boolean>;
  getProfile(id: string): Promise<ProfileRecord | null>;
  /** Adds one to the counter for (key, window) and returns the new count. */
  hit(key: string, windowStart: number): Promise<number>;
}
