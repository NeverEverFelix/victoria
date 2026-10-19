import { describe, expect, it, vi } from "vitest";
import { createSupabaseBearerAuthenticator } from "../../../src/app/auth/supabase-bearer-auth.js";

const userId = "4ea15517-bbc3-48b7-964a-530123b17220";

describe("Supabase bearer authentication", () => {
  it("verifies the token with Supabase Auth and returns only the verified user ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: userId, email: "private@example.com" })));
    const authenticate = createSupabaseBearerAuthenticator({
      supabaseUrl: "https://victoria.supabase.co",
      publishableKey: "sb_publishable_example-key",
      fetcher
    });

    await expect(authenticate(new Request("https://victoria.example/api/memories", {
      headers: { Authorization: "Bearer user-access-token" }
    }))).resolves.toEqual({ userId });
    expect(fetcher).toHaveBeenCalledWith("https://victoria.supabase.co/auth/v1/user", expect.objectContaining({
      headers: { apikey: "sb_publishable_example-key", Authorization: "Bearer user-access-token" },
      cache: "no-store"
    }));
  });

  it("rejects invalid bearer tokens and fails closed when Supabase Auth is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 401 }));
    const authenticate = createSupabaseBearerAuthenticator({
      supabaseUrl: "https://victoria.supabase.co",
      publishableKey: "sb_publishable_example-key",
      fetcher
    });
    const request = () => new Request("https://victoria.example/api/memories", {
      headers: { Authorization: "Bearer user-access-token" }
    });
    await expect(authenticate(request())).resolves.toBeNull();

    fetcher.mockRejectedValueOnce(new Error("network failure"));
    await expect(authenticate(request())).rejects.toThrow("Supabase Auth is unavailable.");
  });

  it("rejects service-role keys and non-HTTPS Supabase endpoints", () => {
    expect(() => createSupabaseBearerAuthenticator({
      supabaseUrl: "https://victoria.supabase.co",
      publishableKey: "sb_secret_do-not-use"
    })).toThrow("A Supabase publishable or anon key is required.");
    expect(() => createSupabaseBearerAuthenticator({
      supabaseUrl: "http://supabase.example",
      publishableKey: "sb_publishable_example-key"
    })).toThrow("SUPABASE_URL must use HTTPS outside localhost.");
  });

  it("accepts IPv6 loopback for local development and rejects non-base64url token characters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: userId })));
    const authenticate = createSupabaseBearerAuthenticator({
      supabaseUrl: "http://[::1]:54321",
      publishableKey: "sb_publishable_local-key",
      fetcher
    });

    await expect(authenticate(new Request("http://localhost/api/memories", {
      headers: { Authorization: "Bearer token+with/slashes=" }
    }))).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
