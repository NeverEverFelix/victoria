import { describe, expect, it, vi } from "vitest";
import {
  createPlaidLinkTokenHandler,
  type PlaidLinkTokenDependencies
} from "../../../src/app/plaid/create-link-token-handler.js";
import { PlaidLinkTokenClient } from "../../../src/app/plaid/plaid-link-token-client.js";

describe("Plaid Link token handler", () => {
  it("allows only POST and does not authenticate or contact providers for other methods", async () => {
    const dependencies = createDependencies();
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(dependencies.authenticate).not.toHaveBeenCalled();
    expect(dependencies.getConsent).not.toHaveBeenCalled();
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("requires an authenticated user before checking consent or calling Plaid", async () => {
    const dependencies = createDependencies({ authenticate: vi.fn().mockResolvedValue(null) });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(dependencies.getConsent).not.toHaveBeenCalled();
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("fails closed when authentication cannot be completed", async () => {
    const dependencies = createDependencies({ authenticate: vi.fn().mockRejectedValue(new Error("private auth detail")) });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "authentication_unavailable" });
    expect(dependencies.getConsent).not.toHaveBeenCalled();
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("does not call Plaid without active, user-scoped connection consent", async () => {
    const dependencies = createDependencies({ getConsent: vi.fn().mockResolvedValue(null) });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(dependencies.getConsent).toHaveBeenCalledWith("user-a");
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("rejects a consent record owned by a different user", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-b", status: "active", products: ["transactions"] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(dependencies.getConsent).toHaveBeenCalledWith("user-a");
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("rejects revoked consent and never recreates a connection from it", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "revoked", products: ["transactions"] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(403);
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("fails closed when consent lookup is unavailable", async () => {
    const dependencies = createDependencies({ getConsent: vi.fn().mockRejectedValue(new Error("private storage detail")) });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "consent_unavailable" });
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("creates a Link token only for the authenticated user's consented read products", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: ["transactions"] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(dependencies.createLinkToken).toHaveBeenCalledWith({ clientUserId: "user-a", products: ["transactions"] });
    expect(await response.json()).toEqual({ linkToken: "link-sandbox-token" });
  });

  it("fails closed if the consent record contains a payment or transfer product", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: ["transactions", "transfer"] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it.each(["payment_initiation", "transfer", "standing_orders", "unknown_product"])(
    "rejects unsupported consented product %s",
    async (product) => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: [product] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(400);
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
    }
  );

  it("rejects an empty product scope rather than opening an unscoped Link flow", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: [] })
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(400);
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("rejects malformed consent data without throwing or contacting Plaid", async () => {
    const dependencies = createDependencies({
      getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: null } as never)
    });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(400);
    expect(dependencies.createLinkToken).not.toHaveBeenCalled();
  });

  it("ignores request-supplied identity and product scope", async () => {
    const dependencies = createDependencies({
      authenticate: vi.fn().mockResolvedValue({ userId: "verified-user" }),
      getConsent: vi.fn().mockResolvedValue({ userId: "verified-user", status: "active", products: ["transactions"] })
    });
    const request = postRequest({ userId: "attacker", products: ["transfer", "investments"] });
    const response = await createPlaidLinkTokenHandler(dependencies)(request);

    expect(response.status).toBe(200);
    expect(dependencies.getConsent).toHaveBeenCalledWith("verified-user");
    expect(dependencies.createLinkToken).toHaveBeenCalledWith({
      clientUserId: "verified-user",
      products: ["transactions"]
    });
  });

  it("does not expose provider errors or tokens when Plaid is unavailable", async () => {
    const dependencies = createDependencies({ createLinkToken: vi.fn().mockRejectedValue(new Error("secret provider details")) });
    const response = await createPlaidLinkTokenHandler(dependencies)(new Request("https://victoria.test/connect", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "plaid_unavailable" });
  });

  it("does not return an empty or whitespace-only token", async () => {
    const dependencies = createDependencies({ createLinkToken: vi.fn().mockResolvedValue("   ") });
    const response = await createPlaidLinkTokenHandler(dependencies)(postRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "plaid_unavailable" });
  });

  it("marks every outcome as non-cacheable", async () => {
    const success = await createPlaidLinkTokenHandler(createDependencies())(postRequest());
    const denied = await createPlaidLinkTokenHandler(createDependencies({
      getConsent: vi.fn().mockResolvedValue(null)
    }))(postRequest());

    expect(success.headers.get("Cache-Control")).toBe("no-store");
    expect(denied.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("PlaidLinkTokenClient", () => {
  it("sends only the requested read products to the configured Plaid environment", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ link_token: "link-token", expiration: "2026-10-08T00:00:00Z", request_id: "req" }), { status: 200 }));
    const client = new PlaidLinkTokenClient({ clientId: "client", secret: "secret", fetcher });

    await expect(client.create({ clientUserId: "user-a", products: ["transactions"] })).resolves.toBe("link-token");

    expect(fetcher).toHaveBeenCalledWith("https://sandbox.plaid.com/link/token/create", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "PLAID-CLIENT-ID": "client", "PLAID-SECRET": "secret" }),
      body: JSON.stringify({
        user: { client_user_id: "user-a" },
        client_name: "Victoria",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en"
      })
    }));
  });

  it("rejects invalid provider responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ access_token: "not-a-link-token" }), { status: 200 }));
    const client = new PlaidLinkTokenClient({ clientId: "client", secret: "secret", fetcher });

    await expect(client.create({ clientUserId: "user-a", products: ["transactions"] })).rejects.toThrow("Invalid Plaid Link token response.");
  });

  it.each([null, {}, { link_token: "" }, { link_token: "   " }, { access_token: "secret-access-token" }])(
    "rejects provider responses that do not contain a usable Link token: %j",
    async (body) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      const client = new PlaidLinkTokenClient({ clientId: "client", secret: "secret", fetcher });

      await expect(client.create({ clientUserId: "user-a", products: ["transactions"] })).rejects.toThrow("Invalid Plaid Link token response.");
    }
  );

  it("does not include provider error details in thrown errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error_message: "private bank details" }), { status: 400 }));
    const client = new PlaidLinkTokenClient({ clientId: "client", secret: "secret", fetcher });

    await expect(client.create({ clientUserId: "user-a", products: ["transactions"] })).rejects.toThrow("Plaid Link token request failed.");
  });

  it("does not send a request for unsupported products even if called outside the HTTP handler", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new PlaidLinkTokenClient({ clientId: "client", secret: "secret", fetcher });

    await expect(client.create({ clientUserId: "user-a", products: ["transfer"] as never })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function createDependencies(overrides: Partial<PlaidLinkTokenDependencies> = {}): PlaidLinkTokenDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({ userId: "user-a" }),
    getConsent: vi.fn().mockResolvedValue({ userId: "user-a", status: "active", products: ["transactions"] }),
    createLinkToken: vi.fn().mockResolvedValue("link-sandbox-token"),
    ...overrides
  };
}

function postRequest(body?: unknown): Request {
  return new Request("https://victoria.test/connect", {
    method: "POST",
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  });
}
