import { describe, expect, it, vi } from "vitest";
import { requestUserApi, UserApiError } from "../../../src/app/client/authenticated-api.js";

describe("same-origin authenticated client API", () => {
  it("sends the current bearer token without caching and serializes only the requested body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ connected: true }), {
      status: 201, headers: { "content-type": "application/json" }
    }));

    const result = await requestUserApi<{ connected: boolean }>("short-lived-access-token", "/api/plaid/token-exchange", {
      method: "POST", body: { public_token: "one-time-public-token" }
    }, fetcher);

    expect(result).toEqual({ connected: true });
    const [path, init] = fetcher.mock.calls[0] ?? [];
    expect(path).toBe("/api/plaid/token-exchange");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error",
      body: JSON.stringify({ public_token: "one-time-public-token" }) });
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer short-lived-access-token");
    expect((init?.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("rejects external paths and empty sessions before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(requestUserApi("token", "https://other.example/api/plaid/consent", {}, fetcher))
      .rejects.toThrow("Only same-origin Victoria API paths are allowed.");
    await expect(requestUserApi(" ", "/api/plaid/consent", {}, fetcher))
      .rejects.toThrow("A signed-in session is required.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a safe typed failure without exposing provider response text", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Plaid item token should never be exposed", { status: 503 }));

    await expect(requestUserApi("token", "/api/plaid/consent", {}, fetcher)).rejects.toMatchObject({
      name: "UserApiError", status: 503, code: "request_failed"
    } satisfies Partial<UserApiError>);
  });
});
