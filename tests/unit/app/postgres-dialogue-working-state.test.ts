import { describe, expect, it } from "vitest";
import type { PostgresQueryable } from "../../../src/app/shared/postgres-types.js";
import { appendDialogueWorkingTurn } from "../../../src/agent/dialogue-working-state.js";
import { PostgresMemoryRepository } from "../../../src/agent/memory/postgres-memory-repository.js";

describe("Postgres dialogue working state", () => {
  it("loads by both authenticated user and conversation, and ignores malformed state", async () => {
    const state = appendDialogueWorkingTurn({ conversationId: "chat-1", sourceTurnId: "turn-1",
      text: "I am weighing debt repayment.", now: new Date("2026-11-01T12:00:00.000Z") });
    let call: { sql: string; values?: readonly unknown[] } | undefined;
    const memory = new PostgresMemoryRepository({
      query: async <Row>(sql: string, values?: readonly unknown[]) => {
        call = { sql, ...(values ? { values } : {}) };
        return { rows: [{ state }] as unknown as readonly Row[] };
      }
    });

    await expect(memory.getDialogueWorkingState("user-1", "chat-1")).resolves.toEqual(state);
    expect(call?.sql).toContain("WHERE user_id = $1 AND conversation_id = $2 AND expires_at > now()");
    expect(call?.sql).toContain("DELETE FROM victoria_dialogue_working_state WHERE expires_at <= now()");
    expect(call?.values).toEqual(["user-1", "chat-1"]);

    const malformed = new PostgresMemoryRepository({
      query: async <Row>() => ({ rows: [{ state: { schemaVersion: 1, conversationId: "other", turns: [] } } as unknown as Row] })
    });
    await expect(malformed.getDialogueWorkingState("user-1", "chat-1")).resolves.toBeUndefined();
  });

  it("upserts scoped state with the state expiry and rejects mismatched conversations", async () => {
    const state = appendDialogueWorkingTurn({ conversationId: "chat-1", sourceTurnId: "turn-1",
      text: "I am weighing debt repayment.", now: new Date("2026-11-01T12:00:00.000Z") });
    let call: { sql: string; values?: readonly unknown[] } | undefined;
    const memory = new PostgresMemoryRepository({
      query: async <Row>(sql: string, values?: readonly unknown[]) => {
        call = { sql, ...(values ? { values } : {}) };
        return { rows: [] as readonly Row[] };
      }
    } satisfies PostgresQueryable);

    await memory.setDialogueWorkingState("user-1", "chat-1", state!);
    expect(call?.sql).toContain("ON CONFLICT (user_id, conversation_id) DO UPDATE");
    expect(call?.values?.[0]).toBe("user-1");
    expect(call?.values?.[1]).toBe("chat-1");
    expect(call?.values?.[4]).toBe(state?.expiresAt);
    await expect(memory.setDialogueWorkingState("user-1", "chat-2", state!))
      .rejects.toThrow("scoped to the requested conversation");
  });
});
