import { describe, expect, it, vi } from "vitest";
import { createQueuedTurn } from "../../../src/domain/turns/lifecycle.js";
import { InMemoryTurnRepository } from "../../../src/app/turns/in-memory-turn-repository.js";
import { createStaleTurnRecoveryProcessor } from "../../../src/app/turns/stale-turn-recovery.js";

describe("stale turn recovery", () => {
  it("finalizes receipted actions, explicitly fails unreceipted interruptions, and leaves fresh turns alone", async () => {
    const turns = new InMemoryTurnRepository();
    await startTurn(turns, "turn-receipted", "2026-10-27T12:00:00.000Z");
    await startTurn(turns, "turn-interrupted", "2026-10-27T12:01:00.000Z");
    await startTurn(turns, "turn-fresh", "2026-10-27T12:19:00.000Z");
    const receipt = {
      message: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved.",
      decision: {
        action: "create_ledger_entry" as const,
        classification: {
          type: "avoided_spend" as const, summary: "Skipped a purchase", confidence: 1, needsClarification: false
        },
        userFacingMessage: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved."
      }
    };
    const completeReceipt = vi.fn(async ({ turnId }: { turnId: string }) =>
      ({ status: "completed" as const, turnId, response: receipt }));

    // Model the action transaction having committed its response receipt while the turn remains running.
    const repository = {
      accept: turns.accept.bind(turns),
      get: turns.get.bind(turns),
      listConversation: turns.listConversation.bind(turns),
      listStaleRunning: async (input: { olderThan: string; limit: number }) => {
        const candidates = await turns.listStaleRunning(input);
        return candidates.map((turn) => turn.id === "turn-receipted" ? { ...turn, resultPayload: receipt } : turn);
      },
      compareAndTransition: turns.compareAndTransition.bind(turns)
    };
    const recovery = createStaleTurnRecoveryProcessor({
      turns: repository,
      processQueuedTurn: completeReceipt,
      now: () => "2026-10-27T12:20:00.000Z",
      staleAfterMs: 60_000
    });

    await expect(recovery()).resolves.toEqual({
      scanned: 2, completedFromReceipt: 1, markedInterrupted: 1, racedOrFailed: 0
    });
    expect(completeReceipt).toHaveBeenCalledExactlyOnceWith({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-receipted"
    });
    expect(await turns.get("user-a", "chat-a", "turn-interrupted")).toMatchObject({
      status: "failed", failureCode: "worker_interrupted"
    });
    expect(await turns.get("user-a", "chat-a", "turn-fresh")).toMatchObject({ status: "running" });
  });
});

async function startTurn(turns: InMemoryTurnRepository, id: string, acceptedAt: string): Promise<void> {
  const turn = createQueuedTurn({
    id, userId: "user-a", conversationId: "chat-a", idempotencyKey: `key-${id}`,
    userMessage: "Yes", requestFingerprint: `fingerprint-${id}`, acceptedAt
  });
  await turns.accept(turn);
  await turns.compareAndTransition({
    userId: turn.userId, conversationId: turn.conversationId, turnId: turn.id, expectedRevision: 0,
    transition: { type: "start", at: new Date(Date.parse(acceptedAt) + 1_000).toISOString() }
  });
}
