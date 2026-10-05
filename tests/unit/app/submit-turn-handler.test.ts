import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubmitTurnHandler,
  InMemoryTurnRepository,
  TurnRepositoryConflictError,
  type SubmitTurnHandlerDependencies
} from "../../../src/app/index.js";

function setup(overrides: Partial<SubmitTurnHandlerDependencies> = {}) {
  const turns = new InMemoryTurnRepository();
  let id = 0;
  const dependencies: SubmitTurnHandlerDependencies = {
    authenticate: vi.fn(async () => ({ userId: "user-1" })),
    ownsConversation: vi.fn(async () => true),
    fingerprintRequest: vi.fn(async ({ message }) => `fingerprint:${message}`),
    createTurnId: vi.fn(() => `turn-${++id}`),
    now: vi.fn(() => "2026-10-05T12:00:00.000Z"),
    turns,
    ...overrides
  };
  return { handler: createSubmitTurnHandler(dependencies), dependencies, turns };
}

function makeRequest(options: {
  method?: string;
  body?: string;
  contentType?: string;
  idempotencyKey?: string;
  contentLength?: string;
} = {}) {
  const headers = new Headers();
  if (options.contentType !== undefined) headers.set("Content-Type", options.contentType);
  else headers.set("Content-Type", "application/json");
  if (options.idempotencyKey !== undefined) headers.set("Idempotency-Key", options.idempotencyKey);
  else headers.set("Idempotency-Key", "request-1");
  if (options.contentLength !== undefined) headers.set("Content-Length", options.contentLength);
  return new Request("https://victoria.example/api/conversations/conversation-1/turns", {
    method: options.method ?? "POST",
    headers,
    ...(options.method === "GET" ? {} : { body: options.body ?? JSON.stringify({ message: "I skipped a purchase." }) })
  });
}

describe("authenticated turn submission handler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("authenticates and checks conversation ownership before accepting a turn", async () => {
    const { handler, dependencies, turns } = setup();
    const response = await handler(makeRequest(), { conversationId: "conversation-1" });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ turnId: "turn-1", status: "queued" });
    expect(dependencies.authenticate).toHaveBeenCalledTimes(1);
    expect(dependencies.ownsConversation).toHaveBeenCalledWith("user-1", "conversation-1");
    expect(await turns.get("user-1", "conversation-1", "turn-1")).toMatchObject({
      userMessage: "I skipped a purchase.", idempotencyKey: "request-1"
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("I skipped a purchase.");
  });

  it("returns the original accepted turn when a client retries the same request", async () => {
    const { handler, dependencies } = setup();
    const first = await handler(makeRequest(), { conversationId: "conversation-1" });
    const retry = await handler(makeRequest(), { conversationId: "conversation-1" });

    expect(first.status).toBe(202);
    expect(retry.status).toBe(202);
    expect((await retry.json()).turnId).toBe("turn-1");
    expect(retry.headers.get("Idempotency-Replayed")).toBe("true");
    expect(dependencies.createTurnId).toHaveBeenCalledTimes(2);
  });

  it("rejects an idempotency key reused for different content", async () => {
    const { handler } = setup();
    await handler(makeRequest(), { conversationId: "conversation-1" });
    const conflict = await handler(makeRequest({ body: JSON.stringify({ message: "A different message." }) }), {
      conversationId: "conversation-1"
    });

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "idempotency_conflict" });
  });

  it("rejects unauthenticated users and conversations they do not own without accepting turns", async () => {
    const deniedAuth = setup({ authenticate: vi.fn(async () => null) });
    const unauthorized = await deniedAuth.handler(makeRequest(), { conversationId: "conversation-1" });
    expect(unauthorized.status).toBe(401);
    expect(deniedAuth.dependencies.ownsConversation).not.toHaveBeenCalled();

    const deniedConversation = setup({ ownsConversation: vi.fn(async () => false) });
    const notFound = await deniedConversation.handler(makeRequest(), { conversationId: "private-conversation" });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "conversation_not_found" });
    expect(await deniedConversation.turns.get("user-1", "private-conversation", "turn-1")).toBeNull();
  });

  it("validates method, idempotency key, content type, JSON, and message shape", async () => {
    const { handler, dependencies } = setup();
    const context = { conversationId: "conversation-1" };
    expect((await handler(makeRequest({ method: "GET" }), context)).status).toBe(405);
    expect((await handler(makeRequest({ idempotencyKey: " " }), context)).status).toBe(400);
    expect((await handler(makeRequest({ contentType: "text/plain" }), context)).status).toBe(415);
    expect((await handler(makeRequest({ body: "{" }), context)).status).toBe(400);
    expect((await handler(makeRequest({ body: JSON.stringify({ message: "  " }) }), context)).status).toBe(400);
    expect((await handler(makeRequest({ body: JSON.stringify({ message: "valid", extra: true }) }), context)).status).toBe(400);
    expect((await handler(makeRequest({ contentLength: "32001" }), context)).status).toBe(413);
    expect((await handler(makeRequest({ body: JSON.stringify({ extra: "x".repeat(32_000) }) }), context)).status).toBe(413);
    expect((await handler(makeRequest({ body: JSON.stringify({ message: "x".repeat(10_001) }) }), context)).status).toBe(400);
    expect(dependencies.createTurnId).not.toHaveBeenCalled();
  });

  it("fails closed when authentication, ownership, fingerprinting, or admission is unavailable", async () => {
    const authFailure = setup({ authenticate: vi.fn(async () => { throw new Error("secret auth details"); }) });
    expect((await authFailure.handler(makeRequest(), { conversationId: "conversation-1" })).status).toBe(503);

    const ownershipFailure = setup({ ownsConversation: vi.fn(async () => { throw new Error("private lookup detail"); }) });
    expect((await ownershipFailure.handler(makeRequest(), { conversationId: "conversation-1" })).status).toBe(503);

    const fingerprintFailure = setup({ fingerprintRequest: vi.fn(async () => { throw new Error("private fingerprint detail"); }) });
    expect((await fingerprintFailure.handler(makeRequest(), { conversationId: "conversation-1" })).status).toBe(503);

    const admissionFailure = setup({ turns: {
      accept: vi.fn(async () => { throw new Error("database credentials must not escape"); }),
      get: vi.fn(async () => null),
      compareAndTransition: vi.fn()
    } });
    const response = await admissionFailure.handler(makeRequest(), { conversationId: "conversation-1" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database credentials");
  });

  it("maps repository idempotency conflicts to a client conflict response", async () => {
    const { handler } = setup({ turns: {
      accept: vi.fn(async () => { throw new TurnRepositoryConflictError("internal conflict detail"); }),
      get: vi.fn(async () => null),
      compareAndTransition: vi.fn()
    } });
    const response = await handler(makeRequest(), { conversationId: "conversation-1" });
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("internal conflict detail");
  });
});
