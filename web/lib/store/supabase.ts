import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRecord } from "../crypto/profile";
import type { DropRow, Store } from "./types";

/** Throw on a Supabase error so API routes fail loudly. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

/** Store backed by Supabase Postgres (see supabase/schema.sql). Server-only: uses the service-role key. */
export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async putDrop(row: DropRow): Promise<void> {
    check(await this.db.from("drops").insert({
      id: row.id, blob: row.blob, delete_hash: row.deleteHash, expires_at: new Date(row.expiresAt).toISOString(),
    }));
  }

  async getDrop(id: string, now: number): Promise<DropRow | null> {
    const data = check(await this.db.from("drops").select("id, blob, delete_hash, expires_at")
      .eq("id", id).gt("expires_at", new Date(now).toISOString()).maybeSingle());
    return data ? { id: data.id, blob: data.blob, deleteHash: data.delete_hash, expiresAt: Date.parse(data.expires_at) } : null;
  }

  async deleteDrop(id: string, deleteHash: string): Promise<boolean> {
    const data = check(await this.db.from("drops").delete().eq("id", id).eq("delete_hash", deleteHash).select("id"));
    return (data ?? []).length > 0;
  }

  async putProfile(id: string, record: ProfileRecord): Promise<boolean> {
    return check(await this.db.rpc("put_profile", { p_id: id, p_record: record, p_updated_at: record.updatedAt })) === true;
  }

  async getProfile(id: string): Promise<ProfileRecord | null> {
    const data = check(await this.db.from("profiles").select("record").eq("id", id).maybeSingle());
    return (data?.record as ProfileRecord) ?? null;
  }

  async hit(key: string, windowStart: number): Promise<number> {
    return check(await this.db.rpc("hit_rate", { p_key: key, p_window: new Date(windowStart).toISOString() })) as number;
  }
}
