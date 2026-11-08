import { describe, expect, it, vi } from "vitest";
import { PendingAmountClarificationService } from "../../../src/agent/pending-amount-clarification-service.js";
import type { PendingAmountClarification, PendingAmountClarificationStore } from "../../../src/agent/pending-amount-clarification-store.js";

const request = { userId: "clarification-user", conversationId: "clarification-chat", message: "$35" };
const pending: PendingAmountClarification = {
  classification: { type: "avoided_spend", confidence: 0.9, summary: "I skipped lunch.", needsClarification: true },
  savingsEvent: {
    id: "event_1", userId: request.userId, type: "avoided_spend", summary: "I skipped lunch.",
    classificationConfidence: 0.9, createdAt: "2026-10-29T12:00:00.000Z"
  }
};

describe("PendingAmountClarificationService", () => {
  it("keeps local clarifications isolated by user and conversation", async () => {
    const service = new PendingAmountClarificationService();
    await service.set(request, pending);

    await expect(service.get(request)).resolves.toEqual(pending);
    await expect(service.get({ ...request, userId: "another-user" })).resolves.toBeUndefined();
    await expect(service.get({ ...request, conversationId: "another-chat" })).resolves.toBeUndefined();
  });

  it("clears only the addressed local clarification", async () => {
    const service = new PendingAmountClarificationService();
    await service.set(request, pending);
    await service.set({ ...request, conversationId: "other-chat" }, pending);

    await service.clear(request);

    await expect(service.get(request)).resolves.toBeUndefined();
    await expect(service.get({ ...request, conversationId: "other-chat" })).resolves.toEqual(pending);
  });

  it("does not let delimiter-containing identities collide", async () => {
    const service = new PendingAmountClarificationService();
    const firstRequest = { userId: "user:one", conversationId: "chat", message: "$35" };
    const secondRequest = { userId: "user", conversationId: "one:chat", message: "$35" };
    const secondPending: PendingAmountClarification = {
      ...pending,
      savingsEvent: { ...pending.savingsEvent, userId: secondRequest.userId, id: "event_2" }
    };
    const firstPending: PendingAmountClarification = {
      ...pending,
      savingsEvent: { ...pending.savingsEvent, userId: firstRequest.userId, id: "event_1" }
    };
    await service.set(firstRequest, firstPending);
    await service.set(secondRequest, secondPending);

    await expect(service.get(firstRequest)).resolves.toEqual(firstPending);
    await expect(service.get(secondRequest)).resolves.toEqual(secondPending);
  });

  it("delegates durable operations with the exact user and conversation scope", async () => {
    const store: PendingAmountClarificationStore = {
      get: vi.fn(async () => pending), set: vi.fn(async () => undefined), clear: vi.fn(async () => undefined)
    };
    const service = new PendingAmountClarificationService(store);

    await expect(service.get(request)).resolves.toEqual(pending);
    await service.set(request, pending);
    await service.clear(request);

    expect(store.get).toHaveBeenCalledWith(request.userId, request.conversationId);
    expect(store.set).toHaveBeenCalledWith(request.userId, request.conversationId, pending);
    expect(store.clear).toHaveBeenCalledWith(request.userId, request.conversationId);
  });

  it("rejects durable clarification records that belong to another user", async () => {
    const store: PendingAmountClarificationStore = {
      get: vi.fn(async () => ({ ...pending, savingsEvent: { ...pending.savingsEvent, userId: "another-user" } })),
      set: vi.fn(async () => undefined), clear: vi.fn(async () => undefined)
    };

    await expect(new PendingAmountClarificationService(store).get(request)).resolves.toBeUndefined();
  });
});
