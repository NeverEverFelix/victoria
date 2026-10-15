import { isPlaidReadProduct, type PlaidReadProduct } from "./create-link-token-handler.js";
import type { PlaidEnv } from "../../config/env.js";

export interface PlaidLinkTokenClientOptions {
  readonly clientId: string;
  readonly secret: string;
  readonly environment?: PlaidEnv;
  readonly fetcher?: typeof fetch;
  readonly apiVersion?: string;
  readonly timeoutMs?: number;
}

interface PlaidLinkTokenResponse {
  readonly link_token?: unknown;
}

/** Minimal server-side adapter for Plaid's Link token endpoint. */
export class PlaidLinkTokenClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PlaidLinkTokenClientOptions) {
    if (!options.clientId.trim() || !options.secret.trim()) throw new Error("Plaid client credentials are required.");
    if ((options.environment ?? "sandbox") !== "sandbox") throw new Error("Only the Plaid sandbox environment is enabled.");
    this.fetcher = options.fetcher ?? fetch;
  }

  async create(input: { clientUserId: string; products: readonly PlaidReadProduct[] }): Promise<string> {
    if (!Array.isArray(input.products) || input.products.length === 0 || !input.products.every(isPlaidReadProduct)) {
      throw new Error("Invalid Plaid read products.");
    }

    const baseUrl = "https://sandbox.plaid.com";
    const response = await this.fetcher(`${baseUrl}/link/token/create`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      headers: {
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": this.options.clientId,
        "PLAID-SECRET": this.options.secret,
        "Plaid-Version": this.options.apiVersion ?? "2020-09-14"
      },
      body: JSON.stringify({
        user: { client_user_id: input.clientUserId },
        client_name: "Victoria",
        products: input.products,
        country_codes: ["US"],
        language: "en"
      })
    });
    if (!response.ok) throw new Error("Plaid Link token request failed.");

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error("Invalid Plaid Link token response.");
    }
    if (!result || typeof result !== "object") {
      throw new Error("Invalid Plaid Link token response.");
    }
    const linkToken = (result as PlaidLinkTokenResponse).link_token;
    if (typeof linkToken !== "string" || !linkToken.trim()) throw new Error("Invalid Plaid Link token response.");
    return linkToken;
  }
}
