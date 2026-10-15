import { describe, expect, it, vi } from "vitest";
import { PlaidApiClient } from "../../../src/app/plaid/plaid-api-client.js";
import { PlaidAccessTokenCipher } from "../../../src/app/plaid/access-token-cipher.js";

function response(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 400 });
}

describe("PlaidApiClient", () => {
  it("exchanges Link public tokens without exposing API credentials in the body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ access_token: "access-test", item_id: "item-1" }));
    const client = new PlaidApiClient({ clientId: "client-test", secret: "secret-test", environment: "sandbox", fetcher });

    await expect(client.exchangePublicToken("public-test")).resolves.toEqual({ accessToken: "access-test", itemId: "item-1" });
    expect(fetcher).toHaveBeenCalledWith("https://sandbox.plaid.com/item/public_token/exchange", expect.objectContaining({
      headers: expect.objectContaining({ "PLAID-CLIENT-ID": "client-test", "PLAID-SECRET": "secret-test" }),
      body: JSON.stringify({ public_token: "public-test" })
    }));
  });

  it("parses cursor sync deltas into normalized, minimal transactions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      added: [{ transaction_id: "tx-1", amount: 12.34, iso_currency_code: "USD", date: "2026-10-01",
        merchant_name: "Cafe", name: "Cafe POS", pending: false,
        personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE" },
        merchant_entity_id: "merchant-123", payment_channel: "online" }],
      modified: [], removed: [{ transaction_id: "tx-old" }], next_cursor: "cursor-2", has_more: true
    }));
    const client = new PlaidApiClient({ clientId: "client-test", secret: "secret-test", environment: "sandbox", fetcher });

    const page = await client.syncTransactions({ accessToken: "access-test", cursor: "cursor-1" });

    expect(page).toEqual({
      added: [{ transactionId: "tx-1", amountCents: 1234, currencyCode: "USD", date: "2026-10-01",
        merchantName: "Cafe", category: "FOOD_AND_DRINK", detailedCategory: "FOOD_AND_DRINK_COFFEE",
        merchantEntityId: "merchant-123", paymentChannel: "online", pending: false }],
      modified: [], removed: ["tx-old"], nextCursor: "cursor-2", hasMore: true
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://sandbox.plaid.com/transactions/sync");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ cursor: "cursor-1", count: 500 });
  });

  it("rejects malformed transaction amounts and never leaks provider errors", async () => {
    const malformed = new PlaidApiClient({ clientId: "client-test", secret: "secret-test", environment: "sandbox",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ added: [{ transaction_id: "x", amount: 1.001,
        date: "2026-10-01", pending: false }], modified: [], removed: [], next_cursor: "c", has_more: false })) });
    await expect(malformed.syncTransactions({ accessToken: "access", cursor: null })).rejects.toThrow("Invalid Plaid transaction amount.");

    const failed = new PlaidApiClient({ clientId: "client-test", secret: "secret-test", environment: "sandbox",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response({ error_message: "sensitive provider details" }, false)) });
    await expect(failed.exchangePublicToken("public-test")).rejects.toThrow("Plaid API request failed.");
  });
});

describe("PlaidAccessTokenCipher", () => {
  it("encrypts and authenticates tokens with a non-repeating IV", () => {
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(17));
    const first = cipher.encrypt("access-sample");
    const second = cipher.encrypt("access-sample");

    expect(first.ciphertext).not.toContain("access-sample");
    expect(first.iv).not.toBe(second.iv);
    expect(cipher.decrypt(first)).toBe("access-sample");
    expect(() => new PlaidAccessTokenCipher(new Uint8Array(32).fill(18)).decrypt(first)).toThrow();
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    expect(() => new PlaidAccessTokenCipher(new Uint8Array(16))).toThrow("must be 32 bytes");
  });
});
