import { describe, expect, it, vi } from "vitest";
import { PostgresPlaidDataRepository } from "../../../src/app/plaid/plaid-data-repository.js";
import type { PostgresPool } from "../../../src/app/turns/postgres-turn-repository.js";

describe("PostgresPlaidDataRepository lifecycle queries", () => {
  it("accepts a valid pruning date and deletes only older rows for the requested user", async () => {
    const query = vi.fn<(sql: string, values?: readonly unknown[]) => Promise<{ rows: never[]; rowCount: number }>>
      (async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidDataRepository({ query } as unknown as PostgresPool);

    await repository.pruneTransactionsBefore("user-1", "2026-07-15");

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM victoria_plaid_transactions WHERE user_id = $1 AND transaction_date < $2",
      ["user-1", "2026-07-15"]
    );
  });

  it("rejects invalid pruning dates before issuing a database query", async () => {
    const query = vi.fn<(sql: string, values?: readonly unknown[]) => Promise<{ rows: never[]; rowCount: number }>>
      (async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidDataRepository({ query } as unknown as PostgresPool);

    await expect(repository.pruneTransactionsBefore("user-1", "2026-02-31")).rejects.toThrow("valid cutoff date");
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps nullable legacy disconnect flags available to normal sync", async () => {
    const query = vi.fn<(sql: string, values?: readonly unknown[]) => Promise<{ rows: never[]; rowCount: number }>>
      (async () => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidDataRepository({ query } as unknown as PostgresPool);

    await repository.listItems("user-1");

    expect(query.mock.calls[0]?.[0]).toContain("disconnect_pending IS NOT TRUE");
  });
});
