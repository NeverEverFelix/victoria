import { describe, expect, it } from "vitest";
import { createQueuedTurn, transitionTurn } from "../../../src/domain/turns/lifecycle.js";

function queuedTurn() {
  return createQueuedTurn({
    id: "turn-1",
    userId: "user-1",
    conversationId: "conversation-1",
    idempotencyKey: "request-1",
    userMessage: "I skipped a purchase.",
    requestFingerprint: "fingerprint-1",
    acceptedAt: "2026-10-05T12:00:00.000Z"
  });
}

describe("durable turn lifecycle", () => {
  it("starts and completes a turn while preserving its identity", () => {
    const queued = queuedTurn();
    const running = transitionTurn(queued, { type: "start", at: "2026-10-05T12:00:01.000Z" });
    const completed = transitionTurn(running, {
      type: "complete",
      at: "2026-10-05T12:00:02.000Z",
      resultId: "result-1"
    });

    expect(queued).toMatchObject({ status: "queued", attempt: 0, revision: 0 });
    expect(running).toMatchObject({ status: "running", attempt: 1, revision: 1 });
    expect(completed).toMatchObject({
      id: queued.id,
      userId: queued.userId,
      conversationId: queued.conversationId,
      idempotencyKey: queued.idempotencyKey,
      userMessage: queued.userMessage,
      requestFingerprint: queued.requestFingerprint,
      status: "completed",
      attempt: 1,
      revision: 2,
      resultId: "result-1"
    });
    expect(Object.isFrozen(completed)).toBe(true);
  });

  it("retries a failed attempt without replacing the accepted turn identity", () => {
    const running = transitionTurn(queuedTurn(), { type: "start", at: "2026-10-05T12:00:01.000Z" });
    const failed = transitionTurn(running, {
      type: "fail",
      at: "2026-10-05T12:00:02.000Z",
      failureCode: "provider_timeout"
    });
    const retried = transitionTurn(failed, { type: "retry", at: "2026-10-05T12:00:03.000Z" });
    const restarted = transitionTurn(retried, { type: "start", at: "2026-10-05T12:00:04.000Z" });

    expect(failed).toMatchObject({ status: "failed", attempt: 1, failureCode: "provider_timeout" });
    expect(retried).toMatchObject({ status: "queued", attempt: 1, revision: 3, idempotencyKey: "request-1" });
    expect(retried).not.toHaveProperty("failureCode");
    expect(restarted).toMatchObject({ status: "running", attempt: 2, id: "turn-1" });
  });

  it("rejects invalid transitions, missing identifiers, and non-chronological updates", () => {
    const queued = queuedTurn();
    expect(() => transitionTurn(queued, { type: "complete", at: "2026-10-05T12:00:01.000Z", resultId: "r" })).toThrow();
    expect(() => transitionTurn(queued, { type: "start", at: "2026-10-05T11:59:59.000Z" })).toThrow();
    expect(() => createQueuedTurn({
      id: "", userId: "user-1", conversationId: "conversation-1", idempotencyKey: "request-1", userMessage: "I skipped a purchase.", requestFingerprint: "fingerprint-1", acceptedAt: "now"
    })).toThrow();
    expect(() => transitionTurn(queued, { type: "start", at: "not-a-date" })).toThrow();

    const running = transitionTurn(queued, { type: "start", at: "2026-10-05T12:00:01.000Z" });
    expect(() => transitionTurn(running, { type: "complete", at: "2026-10-05T12:00:02.000Z", resultId: " " })).toThrow();
    const completed = transitionTurn(running, { type: "complete", at: "2026-10-05T12:00:02.000Z", resultId: "result-1" });
    expect(() => transitionTurn(completed, { type: "start", at: "2026-10-05T12:00:03.000Z" })).toThrow();
  });
});
