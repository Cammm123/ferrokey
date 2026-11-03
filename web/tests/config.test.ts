import { afterEach, describe, expect, it, vi } from "vitest";
import { ipKey } from "@/lib/server/api";
import { getStore, setStore } from "@/lib/store";

afterEach(() => { vi.unstubAllEnvs(); setStore(undefined); });

describe("production config guards", () => {
  it("refuse to hash IPs without RATE_SALT", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_SALT", "");
    expect(() => ipKey("1.2.3.4")).toThrow(/RATE_SALT/);
    vi.stubEnv("RATE_SALT", "some-long-salt");
    expect(ipKey("1.2.3.4")).toHaveLength(32);
  });
  it("refuse a SUPABASE_URL that isn't a Supabase project URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
    vi.stubEnv("SUPABASE_URL", "https://ferrokey.vercel.app");
    expect(() => getStore()).toThrow(/SUPABASE_URL/);
    vi.stubEnv("SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    expect(() => getStore()).not.toThrow();
  });
});
