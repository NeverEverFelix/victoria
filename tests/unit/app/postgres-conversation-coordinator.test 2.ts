import { describe, expect, it, vi } from "vitest";
import { PostgresConversationCoordinator } from "../../../src/app/turns/postgres-conversation-coordinator.js";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../../../src/app/shared/postgres-types.js";

describe("PostgresConversationCoordinator", () => {
  it("returns a bounded timeout when another process holds the conversation lock", async () => {
    const client: PostgresClient = {
      async query<Row>(): Promise<PostgresQueryResult<Row>> {
        return { rows: [{ acquired: false }] as Row[] };
      },
      release: vi.fn()
    };
    const pool: PostgresPool = { query: client.query, connect: async () => client };
    const coordinator = new PostgresConversationCoordinator(pool, 10);

    await expect(coordinator.runExclusive("user-a", "conversation-a", async () => "unused"))
      .rejects.toThrow("Timed out waiting for the conversation lock.");
    expect(client.release).toHaveBeenCalled();
  });
});
