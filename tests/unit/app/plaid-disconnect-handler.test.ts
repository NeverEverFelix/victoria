import { describe, expect, it, vi } from "vitest";
import { createPlaidDisconnectHandler } from "../../../src/app/plaid/disconnect-handler.js";

describe("createPlaidDisconnectHandler", () => {
  it("advertises POST on method rejection", async () => {
    const handler = createPlaidDisconnectHandler({ authenticate: async () => null, lifecycle: { disconnect: vi.fn() } });
    const response = await handler(new Request("https://local.test/plaid/disconnect", { method: "GET" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("requires authenticated identity and never accepts an owner from the body", async () => {
    const disconnect = vi.fn();
    const handler = createPlaidDisconnectHandler({ authenticate: async () => null, lifecycle: { disconnect } });
    const response = await handler(new Request("https://local.test/plaid/disconnect", {
      method: "POST", body: JSON.stringify({ action: "delete_all", userId: "attacker" })
    }));
    expect(response.status).toBe(401);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("disconnects a user-owned Item using only the authenticated identity", async () => {
    const disconnect = vi.fn().mockResolvedValue({ revoked: 1, pending: 0 });
    const handler = createPlaidDisconnectHandler({ authenticate: async () => ({ userId: "owner" }), lifecycle: { disconnect } });
    const response = await handler(new Request("https://local.test/plaid/disconnect", {
      method: "POST", body: JSON.stringify({ action: "disconnect_item", itemId: "item-1", userId: "attacker" })
    }));
    expect(response.status).toBe(200);
    expect(disconnect).toHaveBeenCalledWith("owner", "item-1");
  });

  it("returns accepted while remote revocation is queued for retry", async () => {
    const handler = createPlaidDisconnectHandler({ authenticate: async () => ({ userId: "owner" }),
      lifecycle: { disconnect: async () => ({ revoked: 0, pending: 1 }) } });
    const response = await handler(new Request("https://local.test/plaid/disconnect", {
      method: "POST", body: JSON.stringify({ action: "delete_all" })
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ disconnected: true, pendingRevocations: 1 });
  });

  it("rejects oversized Item IDs", async () => {
    const disconnect = vi.fn();
    const handler = createPlaidDisconnectHandler({ authenticate: async () => ({ userId: "owner" }), lifecycle: { disconnect } });
    const response = await handler(new Request("https://local.test/plaid/disconnect", {
      method: "POST", body: JSON.stringify({ action: "disconnect_item", itemId: "x".repeat(129) })
    }));
    expect(response.status).toBe(400);
    expect(disconnect).not.toHaveBeenCalled();
  });
});
