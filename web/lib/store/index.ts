import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { DropRow, Store } from "./types";
export { MemoryStore } from "./memory";

// Kept on globalThis so the in-memory store survives Next.js dev hot reloads.
const g = globalThis as unknown as { ferrokeyStore?: Store };

/**
 * Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set; otherwise an
 * in-memory store for local development (refused in production).
 */
export function getStore(): Store {
  if (g.ferrokeyStore) return g.ferrokeyStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    g.ferrokeyStore = new SupabaseStore(url, key);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  } else {
    console.warn("[ferrokey] No Supabase keys found: using an in-memory store (drops reset on restart).");
    g.ferrokeyStore = new MemoryStore();
  }
  return g.ferrokeyStore;
}

/** Test hook: swap in a fresh store. */
export function setStore(store: Store | undefined): void {
  g.ferrokeyStore = store;
}
