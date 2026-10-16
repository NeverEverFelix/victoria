import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getMemoryControlsRoute } from "../../../app/api/victoria/settings/memories/route.js";
import { getLocalMemoryControlsRuntime } from "../../../src/app/http/local-memory-controls-runtime.js";
import { signVictoriaSession } from "../../../src/app/http/signed-session-auth.js";

afterEach(() => vi.unstubAllEnvs());

describe("local memory-control route runtime", () => {
  it("fails closed outside local development and without a trusted-session secret", () => {
    const secret = "local-test-auth-secret-that-is-long-enough";
    expect(getLocalMemoryControlsRuntime({ APP_ENV: "production", NODE_ENV: "production", AUTH_SECRET: secret })).toBeNull();
    expect(getLocalMemoryControlsRuntime({ APP_ENV: "local", NODE_ENV: "test", AUTH_SECRET: secret })).toBeNull();
    expect(getLocalMemoryControlsRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: secret, VICTORIA_LOCAL_MEMORY_CONTROLS_ENABLED: "false"
    })).toBeNull();
  });

  it("exposes only signed-session mock memory handlers in local development", async () => {
    const secret = "local-memory-controls-test-secret-long-enough";
    const runtime = getLocalMemoryControlsRuntime({
      APP_ENV: "local",
      NODE_ENV: "development",
      AUTH_SECRET: secret,
      VICTORIA_LOCAL_MEMORY_CONTROLS_ENABLED: "true"
    });
    expect(runtime).toMatchObject({
      memoryControlsCollectionHandler: expect.any(Function),
      memoryControlHandler: expect.any(Function),
      memorySettingsHandler: expect.any(Function)
    });
    const denied = await runtime!.memoryControlsCollectionHandler(new Request("https://victoria.local/api/victoria/settings/memories"));
    expect(denied.status).toBe(401);
    const token = signVictoriaSession({ userId: "local-route-user", secret });
    const allowed = await runtime!.memoryControlsCollectionHandler(new Request("https://victoria.local/api/victoria/settings/memories", {
      headers: { authorization: `Bearer ${token}` }
    }));
    expect(allowed.status).toBe(200);
  });

  it("keeps the Next memory route hidden unless locally enabled and still requires a signed session", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VICTORIA_LOCAL_MEMORY_CONTROLS_ENABLED", "false");
    expect((await getMemoryControlsRoute(new Request("https://victoria.local/api/victoria/settings/memories"))).status).toBe(404);

    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VICTORIA_LOCAL_MEMORY_CONTROLS_ENABLED", "true");
    vi.stubEnv("AUTH_SECRET", "local-route-test-secret-that-is-long-enough");
    expect((await getMemoryControlsRoute(new Request("https://victoria.local/api/victoria/settings/memories"))).status).toBe(401);
  });
});
