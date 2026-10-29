import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  closeLocalPersistentMemoryPools,
  getLocalMockVictoriaRuntime
} from "../../../src/app/http/create-local-mock-victoria-runtime.js";
import { signVictoriaSession } from "../../../src/app/http/signed-session-auth.js";
import { PostgresConversationCoordinator } from "../../../src/app/turns/postgres-conversation-coordinator.js";
import { createPostgresTurnStore } from "../../../src/app/turns/postgres-pool.js";
import { PostgresMockSavingsTools } from "../../../src/app/savings/postgres-mock-savings-tools.js";
import { PostgresPendingGoalAllocationActionStore } from "../../../src/app/savings/postgres-pending-goal-allocation-store.js";
import { PostgresConversationSavingsEventStore } from "../../../src/app/savings/postgres-conversation-savings-event-store.js";
import { PostgresMemoryRepository } from "../../../src/agent/memory/postgres-memory-repository.js";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { suppressLifecycleConflictingEpisodes } from "../../../src/agent/memory/episodic-summary.js";
import { MockLlmAdapter, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.RUN_POSTGRES_MEMORY_CHAT_INTEGRATION === "true" && isSafeLocalDatabase(databaseUrl);
const userId = `memory-check-${randomUUID()}`;
const otherUserId = `memory-check-${randomUUID()}`;
const firstSecret = "postgres-memory-check-first-runtime-secret-32-bytes";
const secondSecret = "postgres-memory-check-second-runtime-secret-32-bytes";
const baseEnv = {
  ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
  APP_ENV: "local",
  NODE_ENV: "development",
  OPENAI_API_KEY: "local-openai-key",
  OPENAI_MODEL: "mock",
  OPENAI_FINANCIAL_MOMENT_ENABLED: "false",
  OPENAI_AGENT_TEAM_ENABLED: "false",
  MONEY_MOVEMENT_MODE: "mock_ledger",
  PLAID_ENV: "sandbox",
  VICTORIA_MEMORY_MODE: "persistent"
};

describe.skipIf(!enabled)("local PostgreSQL-backed chat memory", () => {
  afterAll(async () => {
    await closeLocalPersistentMemoryPools();
  });

  it("persists episode source turns and suppresses a linked episode after forgetting its fact across repository restart", async () => {
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    const turnId = `turn-${randomUUID()}`;
    try {
      const firstRepository = new PostgresMemoryRepository(store.pool);
      const firstMemoryRuntime = new MemoryOrchestrator(firstRepository);
      const fact = await firstMemoryRuntime.rememberConversationalMemory(userId, {
        category: "other", key: `interest:hiking:${randomUUID()}`,
        value: "Enjoys hiking and wants to explore local trails.", evidence: "I love hiking and want to explore local trails.",
        confidence: 0.95, sourceType: "user_statement",
        sourceMetadata: { sourceTurnReferences: [{ turnId }] }
      });
      const episode = await firstMemoryRuntime.rememberConversationalMemory(userId, {
        category: "other", key: `episode:${randomUUID()}`,
        value: "The user enjoys hiking and wants to explore local trails.", evidence: "I love hiking and want to explore local trails.",
        confidence: 0.95, sourceType: "system_inference",
        sourceMetadata: { memoryKind: "episodic_summary", sourceTurnReferences: [{ turnId }] }
      });
      await firstMemoryRuntime.forgetMemory(userId, fact.id);

      // A new repository and orchestrator model a process restart while keeping only the database.
      const restartedRepository = new PostgresMemoryRepository(store.pool);
      const lifecycleRecords = await restartedRepository.listCurrentConversationalMemories(userId, true);
      const visibleRecords = await restartedRepository.listCurrentConversationalMemories(userId, false);
      expect(visibleRecords.find((memory) => memory.id === episode.id)?.sourceMetadata).toMatchObject({
        memoryKind: "episodic_summary", sourceTurnReferences: [{ turnId }]
      });
      expect(suppressLifecycleConflictingEpisodes(visibleRecords, lifecycleRecords).map((memory) => memory.id))
        .not.toContain(episode.id);
      expect(lifecycleRecords.find((memory) => memory.sourceMetadata?.memoryStatus === "forgotten")?.sourceMetadata)
        .toMatchObject({ sourceTurnReferences: [{ turnId }] });
    } finally {
      await store.pool.end();
    }
  });

  it("creates a durable-turn episode through the agent and suppresses it after correcting its fact across repository restart", async () => {
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    const lifecycleUserId = `memory-check-${randomUUID()}`;
    const conversationId = `episode-correction-${randomUUID()}`;
    const turnId = `turn-${randomUUID()}`;
    const userMessage = "I love hiking on weekends.";
    try {
      const firstRepository = new PostgresMemoryRepository(store.pool);
      const firstMemoryRuntime = new MemoryOrchestrator(firstRepository);
      const fact = await firstMemoryRuntime.rememberConversationalMemory(lifecycleUserId, {
        category: "other", key: "interest:hiking", value: "Enjoys hiking on weekends.",
        evidence: userMessage, confidence: 0.95, sourceType: "user_statement",
        sourceMetadata: { sourceTurnReferences: [{ turnId }] }
      });
      await firstMemoryRuntime.setConversationContext(lifecycleUserId, conversationId, [
        userMessage,
        "Victoria: What kind of outdoor routine feels manageable?",
        "I'd like to find a steady weekend trail routine."
      ]);
      const agent = new VictoriaAgent({
        llm: new MockLlmAdapter(), memory: firstMemoryRuntime, tools: new MockVictoriaTools(),
        episodicMemorySummarizer: {
          async summarize() {
            return {
              summary: "The user enjoys hiking and wants a steady weekend trail routine.",
              evidenceQuotes: [userMessage], confidence: 0.94, sensitivity: "ordinary"
            };
          }
        }
      });

      await expect(agent.finishConversation(lifecycleUserId, conversationId, [
        { turnId, userMessage }
      ])).resolves.toBe(true);
      const episode = (await firstMemoryRuntime.listConversationalMemories(lifecycleUserId))
        .find((memory) => memory.sourceMetadata?.memoryKind === "episodic_summary");
      expect(episode?.sourceMetadata?.sourceTurnReferences).toEqual([{ turnId, userMessage }]);

      await firstMemoryRuntime.correctMemory(lifecycleUserId, fact.id, "I don't enjoy hiking anymore.");

      // A new repository and orchestrator model a process restart while retaining database state only.
      const restartedRepository = new PostgresMemoryRepository(store.pool);
      const lifecycleRecords = await restartedRepository.listCurrentConversationalMemories(lifecycleUserId, true);
      const visibleRecords = await restartedRepository.listCurrentConversationalMemories(lifecycleUserId, false);
      const currentContext = suppressLifecycleConflictingEpisodes(visibleRecords, lifecycleRecords);
      expect(currentContext.some((memory) => memory.id === episode?.id)).toBe(false);
      expect(currentContext.map((memory) => memory.id)).not.toContain(episode?.id);
      expect(lifecycleRecords.find((memory) => memory.sourceType === "user_correction")?.sourceMetadata)
        .toMatchObject({ sourceTurnReferences: [{ turnId }] });
      const restartedMemoryRuntime = new MemoryOrchestrator(restartedRepository);
      const restartedAgent = new VictoriaAgent({
        llm: new MockLlmAdapter(), memory: restartedMemoryRuntime, tools: new MockVictoriaTools()
      });
      const later = await restartedAgent.respond({
        userId: lifecycleUserId, conversationId: `later-${randomUUID()}`,
        message: "Can you help me plan a steady weekend trail routine?"
      });
      expect(later.message).not.toContain("note from an earlier conversation");
      expect(later.message).not.toContain("enjoys hiking");
    } finally {
      await store.pool.end();
    }
  });

  it("persists savings events and scopes lookup to the exact user and conversation", async () => {
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    const events = new PostgresConversationSavingsEventStore(store.pool);
    const conversationId = `event-lookup-${randomUUID()}`;
    const event = {
      id: `event-${randomUUID()}`, userId, type: "avoided_spend" as const,
      summary: "Cooked instead of ordering takeout", merchantName: "takeout",
      userProvidedAmountCents: 2400, classificationConfidence: 0.95,
      createdAt: new Date().toISOString()
    };
    try {
      await events.record({ conversationId, event });
      const freshStore = new PostgresConversationSavingsEventStore(store.pool);
      await expect(freshStore.list(userId, conversationId)).resolves.toEqual([event]);
      await expect(freshStore.list(userId, `${conversationId}-other`)).resolves.toEqual([]);
      await expect(freshStore.list(otherUserId, conversationId)).resolves.toEqual([]);
    } finally {
      await store.pool.end();
    }
  });

  it("keeps turn and Plaid consent tables server-only", async () => {
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const access = await store.pool.query<{
        relname: string;
        rls: boolean;
        anon_select: boolean;
        authenticated_select: boolean;
        service_select: boolean;
      }>(
        `SELECT c.relname, c.relrowsecurity AS rls,
           has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
           has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
           has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
         ORDER BY c.relname`,
        [["victoria_plaid_consent_events", "victoria_turns"]]
      );
      expect(access.rows).toHaveLength(2);
      expect(access.rows.every((row) => row.rls && !row.anon_select && !row.authenticated_select && row.service_select))
        .toBe(true);

      const memoryPolicies = await store.pool.query<{ tablename: string; cmd: string }>(
        `SELECT tablename, cmd FROM pg_policies
         WHERE schemaname = 'public' AND roles @> ARRAY['victoria_memory_api']::name[]
         ORDER BY tablename, cmd`
      );
      expect(memoryPolicies.rows).toEqual([
        { tablename: "victoria_conversational_memories", cmd: "INSERT" },
        { tablename: "victoria_conversational_memories", cmd: "SELECT" },
        { tablename: "victoria_memory_embeddings", cmd: "INSERT" },
        { tablename: "victoria_memory_embeddings", cmd: "SELECT" }
      ]);
    } finally {
      await store.pool.end();
    }
  });

  it("recalls a user's explicit preference after a fresh agent runtime without sharing it with another user", async () => {
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const learned = await firstRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: firstSecret }),
      "remember-this",
      "I prefer saving $20 rather than $50 at a time."
    ), { conversationId: "remember-this" });
    expect(learned.status).toBe(200);

    // A different signing key forces a new agent instance while leaving the
    // persistent database and authenticated user identity unchanged.
    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const later = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: secondSecret }),
      "later-reflection",
      "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: "later-reflection" });
    expect(await later.json()).toMatchObject({ message: expect.stringContaining("preference for saving $20 rather than $50 at a time") });

    const isolated = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId: otherUserId, secret: secondSecret }),
      "other-person",
      "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: "other-person" });
    const isolatedBody = await isolated.json() as { message: string };
    expect(isolatedBody.message).not.toContain("$20");
    expect(isolatedBody.message).not.toContain("$50");

    const memoryToken = signVictoriaSession({ userId, secret: secondSecret });
    const listed = await restartedRuntime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${memoryToken}` } }
    ));
    expect(listed.status).toBe(200);
    const listedBody = await listed.json() as { memories: Array<{ value: string }> };
    expect(listedBody.memories.some((memory) => memory.value.includes("$20.00 rather than $50.00"))).toBe(true);

    const otherUserListing = await restartedRuntime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${signVictoriaSession({ userId: otherUserId, secret: secondSecret })}` } }
    ));
    expect(otherUserListing.status).toBe(200);
    expect(await otherUserListing.json()).toMatchObject({ memories: [] });
    const unauthenticatedListing = await restartedRuntime!.memoryManagementHandler!.collection(
      new Request("https://victoria.local/api/memories")
    );
    expect(unauthenticatedListing.status).toBe(401);
  });

  it("resumes an unanswered avoided-spend amount clarification after a fresh agent runtime", async () => {
    const conversationId = `clarification-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const question = await firstRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: firstSecret }),
      conversationId,
      "I cooked instead of ordering takeout."
    ), { conversationId });
    expect(await question.json()).toMatchObject({ message: expect.stringContaining("About how much") });

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const resumed = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: secondSecret }),
      conversationId,
      "About $18."
    ), { conversationId });
    const resumedBody = await resumed.json() as { message: string; decision: { action: string } };
    expect(resumedBody.decision.action).toBe("suggest_savings");
    expect(resumedBody.message).toContain("$18.00");
    expect(resumedBody.message).toContain("No real money has moved");

    const otherUserReply = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId: otherUserId, secret: secondSecret }),
      conversationId,
      "About $18."
    ), { conversationId });
    const otherUserBody = await otherUserReply.json() as { message: string; decision: { action: string } };
    expect(otherUserBody.decision.action).toBe("ask_follow_up");
    expect(otherUserBody.message).not.toContain("$18.00");

    const replayedClarification = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: secondSecret }),
      conversationId,
      "About $18."
    ), { conversationId });
    const replayedBody = await replayedClarification.json() as { message: string; decision: { action: string } };
    expect(replayedBody.decision.action).toBe("ask_follow_up");
    expect(replayedBody.message).toContain("$18.00 savings suggestion is still pending");
    expect(replayedBody.message).toContain("confirm or decline");
  });

  it("restores a revision clarification across fresh runtimes and still requires new approval", async () => {
    const revisionUserId = `memory-check-${randomUUID()}`;
    const conversationId = `revision-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const token = signVictoriaSession({ userId: revisionUserId, secret: firstSecret });
    const proposed = await firstRuntime!.handler(chatRequest(
      token,
      conversationId,
      "I almost bought a $20 pastry but decided to wait."
    ), { conversationId });
    expect((await proposed.json() as { message: string }).message).toContain("$20.00");

    const unclearRevision = await firstRuntime!.handler(chatRequest(
      token,
      conversationId,
      "Actually, make that $6 or $8."
    ), { conversationId });
    expect((await unclearRevision.json() as { message: string }).message).toContain("haven't changed the pending suggestion");

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const restartedToken = signVictoriaSession({ userId: revisionUserId, secret: secondSecret });
    const staleApproval = await restartedRuntime!.handler(chatRequest(
      restartedToken,
      conversationId,
      "Yes"
    ), { conversationId });
    expect((await staleApproval.json() as { message: string }).message).toContain("unambiguous amount");

    const revised = await restartedRuntime!.handler(chatRequest(
      restartedToken,
      conversationId,
      "Use $8."
    ), { conversationId });
    expect((await revised.json() as { message: string }).message).toContain("$8.00");

    const approved = await restartedRuntime!.handler(chatRequest(
      restartedToken,
      conversationId,
      "Yes"
    ), { conversationId });
    expect((await approved.json() as { message: string }).message).toContain("recorded $8.00");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const revisions = await store.pool.query<{ amount_cents: number; proposal_id: string; supersedes_proposal_id: string | null; status: string }>(
        `SELECT (p.decision #>> '{proposal,suggestion,amountCents}')::integer AS amount_cents,
           p.proposal_id,
           p.decision #>> '{proposal,supersedesProposalId}' AS supersedes_proposal_id,
           t.to_status AS status
         FROM victoria_local_savings_proposals p
         JOIN LATERAL (
           SELECT to_status FROM victoria_local_savings_proposal_transitions
           WHERE user_id = p.user_id AND proposal_id = p.proposal_id
           ORDER BY created_at DESC, transition_id DESC LIMIT 1
         ) t ON true
         WHERE p.user_id = $1 AND p.conversation_id = $2
         ORDER BY p.created_at, p.proposal_id`,
        [revisionUserId, conversationId]
      );
      expect(revisions.rows).toHaveLength(2);
      expect(revisions.rows[1]).toMatchObject({ amount_cents: 800, status: "recorded" });
      expect(revisions.rows[1]?.supersedes_proposal_id).toBe(revisions.rows[0]?.proposal_id);
    } finally {
      await store.pool.end();
    }
  });

  it("persists a non-active revision-target clarification and blocks amount-only follow-up after restart", async () => {
    const targetUserId = `memory-check-${randomUUID()}`;
    const conversationId = `revision-target-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const firstToken = signVictoriaSession({ userId: targetUserId, secret: firstSecret });
    const proposed = await firstRuntime!.handler(chatRequest(
      firstToken, conversationId, "I almost bought a $20 pastry but decided to wait."
    ), { conversationId });
    expect((await proposed.json() as { message: string }).message).toContain("$20.00");

    const wrongTarget = await firstRuntime!.handler(chatRequest(
      firstToken, conversationId, "Actually revise my coffee-shop purchase to $8."
    ), { conversationId });
    expect((await wrongTarget.json() as { message: string }).message).toContain("can't target an older event");

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const restartedToken = signVictoriaSession({ userId: targetUserId, secret: secondSecret });
    const amountOnly = await restartedRuntime!.handler(chatRequest(
      restartedToken, conversationId, "Use $8."
    ), { conversationId });
    expect((await amountOnly.json() as { message: string }).message).toContain("decline the current suggestion");

    const staleApproval = await restartedRuntime!.handler(chatRequest(
      restartedToken, conversationId, "Yes"
    ), { conversationId });
    expect((await staleApproval.json() as { message: string }).message).toContain("can't target an older event");

    const declined = await restartedRuntime!.handler(chatRequest(
      restartedToken, conversationId, "No"
    ), { conversationId });
    expect((await declined.json() as { message: string }).message).toContain("won't record it");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const marker = await store.pool.query<{ clarification_id: string }>(
        `SELECT clarification_id FROM victoria_local_savings_revision_target_clarifications
         WHERE user_id = $1 AND conversation_id = $2`,
        [targetUserId, conversationId]
      );
      expect(marker.rows).toEqual([{ clarification_id: expect.stringContaining(":revision-target") }]);
    } finally {
      await store.pool.end();
    }
  });

  it("forgets a local memory from listing and retrieval while retaining its linked history", async () => {
    const forgetUserId = `memory-check-${randomUUID()}`;
    const conversationId = `forget-${randomUUID()}`;
    const runtime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(runtime?.memoryManagementHandler).toBeDefined();
    const token = signVictoriaSession({ userId: forgetUserId, secret: secondSecret });
    const learned = await runtime!.handler(chatRequest(
      token,
      conversationId,
      "I prefer saving $20 rather than $50 at a time."
    ), { conversationId });
    expect(learned.status).toBe(200);

    const listed = await runtime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${token}` } }
    ));
    const memories = (await listed.json() as { memories: Array<{ id: string; value: string }> }).memories;
    const target = memories.find((memory) => memory.value.includes("$20.00 rather than $50.00"));
    expect(target).toBeDefined();

    const forgotten = await runtime!.memoryManagementHandler!.forget(
      new Request(`https://victoria.local/api/memories/${target!.id}/forget`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      }),
      { memoryId: target!.id }
    );
    expect(forgotten.status).toBe(200);
    expect(await forgotten.json()).toMatchObject({ status: "forgotten", memoryId: target!.id });

    const repeatedForget = await runtime!.memoryManagementHandler!.forget(
      new Request(`https://victoria.local/api/memories/${target!.id}/forget`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      }),
      { memoryId: target!.id }
    );
    expect(repeatedForget.status).toBe(404);
    const current = await runtime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${token}` } }
    ));
    expect(await current.json()).toMatchObject({ memories: [] });

    const reflectionConversationId = `after-forget-${randomUUID()}`;
    const reflection = await runtime!.handler(chatRequest(
      token,
      reflectionConversationId,
      "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: reflectionConversationId });
    const reflectionBody = await reflection.json() as { message: string };
    expect(reflectionBody.message).not.toContain("$20");
    expect(reflectionBody.message).not.toContain("$50");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const history = await store.pool.query<{ id: string; supersedes_id: string | null; source_metadata: Record<string, unknown> }>(
        `SELECT id, supersedes_id, source_metadata FROM victoria_conversational_memories
         WHERE user_id = $1 ORDER BY created_at, id`,
        [forgetUserId]
      );
      expect(history.rows).toHaveLength(2);
      expect(history.rows[1]?.supersedes_id).toBe(history.rows[0]?.id);
      expect(history.rows[1]?.source_metadata.memoryStatus).toBe("forgotten");
    } finally {
      await store.pool.end();
    }
  });

  it("corrects one current local memory by appending a linked fact used in later retrieval", async () => {
    const correctionUserId = `memory-check-${randomUUID()}`;
    const conversationId = `correct-${randomUUID()}`;
    const runtime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(runtime?.memoryManagementHandler).toBeDefined();
    const token = signVictoriaSession({ userId: correctionUserId, secret: secondSecret });
    const learned = await runtime!.handler(chatRequest(
      token,
      conversationId,
      "I prefer saving $20 rather than $50 at a time."
    ), { conversationId });
    expect(learned.status).toBe(200);

    const listed = await runtime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${token}` } }
    ));
    const memories = (await listed.json() as { memories: Array<{ id: string; value: string }> }).memories;
    const target = memories.find((memory) => memory.value.includes("$20.00 rather than $50.00"));
    expect(target).toBeDefined();

    const corrected = await runtime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: target!.id, value: "Prefers saving $25 rather than $50 at a time." })
      }
    ));
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({
      memory: { value: "Prefers saving $25 rather than $50 at a time.", sourceType: "user_correction" }
    });

    const afterCorrection = await runtime!.memoryManagementHandler!.collection(new Request(
      "https://victoria.local/api/memories",
      { headers: { authorization: `Bearer ${token}` } }
    ));
    const current = (await afterCorrection.json() as { memories: Array<{ value: string }> }).memories;
    expect(current).toHaveLength(1);
    expect(current[0]?.value).toBe("Prefers saving $25 rather than $50 at a time.");

    const reflectionConversationId = `after-correction-${randomUUID()}`;
    const reflection = await runtime!.handler(chatRequest(
      token,
      reflectionConversationId,
      "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: reflectionConversationId });
    const reflectionBody = await reflection.json() as { message: string };
    expect(reflectionBody.message).toContain("$25");
    expect(reflectionBody.message).not.toContain("$20");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const history = await store.pool.query<{ id: string; value: string; supersedes_id: string | null }>(
        `SELECT id, value, supersedes_id FROM victoria_conversational_memories
         WHERE user_id = $1 ORDER BY created_at, id`,
        [correctionUserId]
      );
      expect(history.rows).toHaveLength(2);
      expect(history.rows[0]?.value).toContain("$20.00");
      expect(history.rows[1]?.value).toBe("Prefers saving $25 rather than $50 at a time.");
      expect(history.rows[1]?.supersedes_id).toBe(history.rows[0]?.id);
    } finally {
      await store.pool.end();
    }
  });

  it("records one mocked savings entry when a pending suggestion is confirmed after restart", async () => {
    const conversationId = `approval-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const proposal = await firstRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: firstSecret }),
      conversationId,
      "I almost bought a $27 pastry but decided to wait."
    ), { conversationId });
    expect((await proposal.json() as { message: string }).message).toContain("$27.00");

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const recorded = await restartedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: secondSecret }), conversationId, "Yes"
    ), { conversationId });
    const recordedBody = await recorded.json() as { message?: string; error?: string };
    expect(recordedBody.message ?? recordedBody.error).toContain("recorded $27.00");

    const laterRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: `${secondSecret}-fresh` });
    expect(laterRuntime).not.toBeNull();
    const progress = await laterRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: `${secondSecret}-fresh` }),
      conversationId,
      "How much have I saved this week?"
    ), { conversationId });
    expect((await progress.json() as { message: string }).message).toContain("$27.00 recorded");

    const unboundApproval = await laterRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: `${secondSecret}-fresh` }), conversationId, "Yes"
    ), { conversationId });
    expect((await unboundApproval.json() as { message: string }).message).not.toContain("recorded $27.00");
    const finalProgress = await laterRuntime!.handler(chatRequest(
      signVictoriaSession({ userId, secret: `${secondSecret}-fresh` }),
      conversationId,
      "How much have I saved this week?"
    ), { conversationId });
    expect((await finalProgress.json() as { message: string }).message).toContain("$27.00 recorded");
  });

  it("persists an approved goal allocation as immutable linked history", async () => {
    const allocationUserId = `memory-check-${randomUUID()}`;
    const conversationId = `goal-allocation-${randomUUID()}`;
    const token = signVictoriaSession({ userId: allocationUserId, secret: firstSecret });
    const runtime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(runtime).not.toBeNull();

    await runtime!.handler(chatRequest(token, conversationId, "I almost bought a $32 game but decided to wait."), { conversationId });
    await runtime!.handler(chatRequest(token, conversationId, "Yes"), { conversationId });
    const proposed = await runtime!.handler(chatRequest(token, conversationId, "Put that toward my emergency fund."), { conversationId });
    expect((await proposed.json() as { decision: { action: string } }).decision.action).toBe("update_goal");
    const recorded = await runtime!.handler(chatRequest(token, conversationId, "Yes"), { conversationId });
    expect((await recorded.json() as { decision: { action: string } }).decision.action).toBe("record_goal_allocation");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const tools = new PostgresMockSavingsTools(store.pool);
      const allocations = await tools.listSavingsGoalAllocations(allocationUserId);
      expect(allocations).toHaveLength(1);
      const allocation = allocations[0];
      expect(allocation).toMatchObject({ amountCents: 3200, goalName: "Emergency fund" });
      expect(allocation?.approval.actionId).toBe(allocation?.approvedActionId);
      if (!allocation) throw new Error("Expected the goal allocation to persist.");
      const before = await store.pool.query<{ amount_cents: string; goal_name: string | null }>(
        "SELECT amount_cents::text, goal_name FROM victoria_local_savings_entries WHERE user_id = $1 AND entry_id = $2",
        [allocationUserId, allocation.savingsEntryId]
      );
      expect(before.rows).toEqual([{ amount_cents: "3200", goal_name: null }]);

      const replay = await tools.createSavingsGoalAllocation({
        userId: allocationUserId,
        savingsEntryId: allocation.savingsEntryId,
        amountCents: allocation.amountCents,
        goalName: allocation.goalName,
        approval: allocation.approval,
        approvedActionId: allocation.approvedActionId
      });
      expect(replay).toEqual(allocation);
      await expect(tools.createSavingsGoalAllocation({
        userId: allocationUserId,
        savingsEntryId: allocation.savingsEntryId,
        amountCents: allocation.amountCents,
        goalName: allocation.goalName,
        approval: { ...allocation.approval, userId: "another-user" },
        approvedActionId: allocation.approvedActionId
      })).rejects.toThrow("match its user and approved action");
      await expect(tools.createSavingsGoalAllocation({
        userId: allocationUserId,
        savingsEntryId: allocation.savingsEntryId,
        amountCents: allocation.amountCents,
        goalName: "Vacation",
        approval: allocation.approval,
        approvedActionId: allocation.approvedActionId
      })).rejects.toThrow("An approved action cannot be reused for a different goal allocation.");
    } finally {
      await store.pool.end();
    }
  });

  it("persists approved entry corrections and uses the corrected amount after a runtime restart", async () => {
    const correctionUserId = `memory-check-${randomUUID()}`;
    const conversationId = `correction-restart-${randomUUID()}`;
    const token = signVictoriaSession({ userId: correctionUserId, secret: firstSecret });
    const runtime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(runtime).not.toBeNull();
    await runtime!.handler(chatRequest(token, conversationId,
      "I almost bought a $45 book but decided to wait."), { conversationId });
    await runtime!.handler(chatRequest(token, conversationId, "Yes"), { conversationId });

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const fallbackEntry = await store.pool.query<{ entry_id: string }>(
        `SELECT entry_id FROM victoria_local_savings_entries e
         JOIN victoria_local_savings_proposals p USING (user_id, proposal_id)
         WHERE e.user_id = $1 AND p.conversation_id = $2`,
        [correctionUserId, conversationId]
      );
      const entryId = fallbackEntry.rows[0]?.entry_id;
      expect(entryId).toBeDefined();
      if (!entryId) throw new Error("Expected a persisted savings entry.");

      const firstTools = new PostgresMockSavingsTools(store.pool);
      const input = {
        userId: correctionUserId,
        savingsEntryId: entryId,
        correctedAmountCents: 3000,
        reason: "User corrected the saved estimate.",
        approvalId: `correction-approval-${randomUUID()}`,
        approvedActionId: `correction-action-${randomUUID()}`
      };
      const correction = await firstTools.createSavingsEntryCorrection(input);
      expect(correction).toMatchObject({ correctedAmountCents: 3000, adjustmentCents: -1500 });
      const approval = await store.pool.query<{ approval: { userId: string; actionId: string; savingsEntryId: string; correctedAmountCents: number } }>(
        `SELECT approval FROM victoria_local_savings_entry_correction_approvals
         WHERE user_id = $1 AND approved_action_id = $2`,
        [correctionUserId, input.approvedActionId]
      );
      expect(approval.rows[0]?.approval).toMatchObject({
        userId: correctionUserId, actionId: input.approvedActionId,
        savingsEntryId: entryId, correctedAmountCents: 3000
      });
      await expect(store.pool.query(
        `INSERT INTO victoria_local_savings_entry_corrections
          (correction_id, user_id, savings_entry_id, prior_amount_cents, corrected_amount_cents,
           adjustment_cents, reason, approval_id, approved_action_id, created_at)
         VALUES ($1, $2, $3, 4500, 2000, -2500, 'Missing approval', 'approval_missing', 'action_missing', now())`,
        [`unapproved-correction-${randomUUID()}`, correctionUserId, entryId]
      )).rejects.toThrow();

      const restartedTools = new PostgresMockSavingsTools(store.pool);
      expect(await restartedTools.getEffectiveSavingsEntryAmount(correctionUserId, entryId)).toBe(3000);
      expect(await restartedTools.getWeeklySavingsTotal(correctionUserId)).toBe(3000);
      expect(await restartedTools.listSavingsEntryCorrections(correctionUserId)).toEqual([correction]);
      expect(await restartedTools.createSavingsEntryCorrection(input)).toEqual(correction);
      await expect(restartedTools.createSavingsEntryCorrection({ ...input, correctedAmountCents: 3500 }))
        .rejects.toThrow("An approved action cannot be reused for a different savings correction.");

      const goalProposal = await runtime!.handler(chatRequest(token, conversationId,
        "Put that toward my emergency fund."), { conversationId });
      expect((await goalProposal.json() as { decision: { action: string } }).decision.action).toBe("update_goal");
      const goalRecorded = await runtime!.handler(chatRequest(token, conversationId, "Yes"), { conversationId });
      expect((await goalRecorded.json() as { decision: { action: string } }).decision.action).toBe("record_goal_allocation");
      expect(await restartedTools.listSavingsGoalAllocations(correctionUserId)).toMatchObject([
        { savingsEntryId: entryId, amountCents: 3000, goalName: "Emergency fund" }
      ]);

      const original = await store.pool.query<{ amount_cents: string }>(
        "SELECT amount_cents::text FROM victoria_local_savings_entries WHERE user_id = $1 AND entry_id = $2",
        [correctionUserId, entryId]
      );
      expect(original.rows[0]?.amount_cents).toBe("4500");
    } finally {
      await store.pool.end();
    }
  });

  it("restores an unapproved entry correction after a runtime restart", async () => {
    const correctionUserId = `memory-check-${randomUUID()}`;
    const conversationId = `pending-correction-restart-${randomUUID()}`;
    const firstToken = signVictoriaSession({ userId: correctionUserId, secret: firstSecret });
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    await firstRuntime!.handler(chatRequest(firstToken, conversationId,
      "I almost bought a $45 book but decided to wait."), { conversationId });
    await firstRuntime!.handler(chatRequest(firstToken, conversationId, "Yes"), { conversationId });
    const proposed = await firstRuntime!.handler(chatRequest(firstToken, conversationId,
      "I need to correct that entry. I saved $30, not $45."), { conversationId });
    expect((await proposed.json() as { decision: { action: string } }).decision.action).toBe("correct_ledger_entry");

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const secondToken = signVictoriaSession({ userId: correctionUserId, secret: secondSecret });
    const recorded = await restartedRuntime!.handler(chatRequest(secondToken, conversationId, "Yes"), { conversationId });
    expect((await recorded.json() as { message: string; decision: { action: string } })).toMatchObject({
      decision: { action: "correct_ledger_entry" }, message: expect.stringContaining("corrected the recorded amount to $30.00")
    });
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const entries = await new PostgresMockSavingsTools(store.pool).listSavingsEntries(correctionUserId);
      expect(entries).toHaveLength(1);
      expect(await new PostgresMockSavingsTools(store.pool).getEffectiveSavingsEntryAmount(correctionUserId, entries[0]!.id)).toBe(3000);
      const transitions = await store.pool.query<{ status: string }>(
        "SELECT status FROM victoria_local_entry_correction_transitions WHERE user_id = $1 AND conversation_id = $2",
        [correctionUserId, conversationId]);
      expect(transitions.rows).toEqual([{ status: "recorded" }]);
    } finally { await store.pool.end(); }
  });

  it("keeps a restored correction unchanged when the user declines", async () => {
    const correctionUserId = `memory-check-${randomUUID()}`;
    const conversationId = `declined-correction-restart-${randomUUID()}`;
    const firstToken = signVictoriaSession({ userId: correctionUserId, secret: firstSecret });
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    await firstRuntime!.handler(chatRequest(firstToken, conversationId,
      "I almost bought a $45 book but decided to wait."), { conversationId });
    await firstRuntime!.handler(chatRequest(firstToken, conversationId, "Yes"), { conversationId });
    await firstRuntime!.handler(chatRequest(firstToken, conversationId,
      "I need to correct that entry. I saved $30, not $45."), { conversationId });

    const restartedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(restartedRuntime).not.toBeNull();
    const secondToken = signVictoriaSession({ userId: correctionUserId, secret: secondSecret });
    const declined = await restartedRuntime!.handler(chatRequest(secondToken, conversationId, "No"), { conversationId });
    expect((await declined.json() as { message: string }).message).toContain("entry remains unchanged");
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const rows = await store.pool.query<{ status: string }>(
        "SELECT status FROM victoria_local_entry_correction_transitions WHERE user_id = $1 AND conversation_id = $2",
        [correctionUserId, conversationId]);
      expect(rows.rows).toEqual([{ status: "declined" }]);
      const corrections = await store.pool.query("SELECT 1 FROM victoria_local_savings_entry_corrections WHERE user_id = $1", [correctionUserId]);
      expect(corrections.rowCount).toBe(0);
    } finally { await store.pool.end(); }
  });

  it("restores a pending goal allocation after restart and persists its terminal approval or decline", async () => {
    const allocationUserId = `memory-check-${randomUUID()}`;
    const approvalConversationId = `goal-resume-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    expect(firstRuntime).not.toBeNull();
    const firstToken = signVictoriaSession({ userId: allocationUserId, secret: firstSecret });
    await firstRuntime!.handler(chatRequest(firstToken, approvalConversationId,
      "I almost bought a $24 game but decided to wait."), { conversationId: approvalConversationId });
    await firstRuntime!.handler(chatRequest(firstToken, approvalConversationId, "Yes"), { conversationId: approvalConversationId });
    const proposed = await firstRuntime!.handler(chatRequest(firstToken, approvalConversationId,
      "Put that toward my emergency fund."), { conversationId: approvalConversationId });
    expect((await proposed.json() as { decision: { action: string } }).decision.action).toBe("update_goal");

    // Simulate the ledger write succeeding while the response/terminal transition is lost.
    const recoveredApproval = {
      id: `goal-approval-${randomUUID()}`,
      userId: allocationUserId,
      actionId: "",
      approvedAt: new Date().toISOString(),
      source: "user_message" as const
    };
    const recoveryStore = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const pending = await new PostgresPendingGoalAllocationActionStore(recoveryStore.pool)
        .getPending(allocationUserId, approvalConversationId);
      expect(pending).not.toBeNull();
      const goal = pending?.decision.goalAllocation;
      expect(goal?.status).toBe("pending");
      if (!pending || !goal || goal.status !== "pending") throw new Error("Expected a durable pending goal action.");
      const pendingStore = new PostgresPendingGoalAllocationActionStore(recoveryStore.pool);
      await expect(pendingStore.commit({
        userId: allocationUserId,
        conversationId: approvalConversationId,
        approvalAction: {
          actionId: pending.actionId,
          approval: { ...recoveredApproval, userId: "another-user", actionId: pending.actionId }
        }
      })).rejects.toThrow("match its exact user and action");
      const approval = { ...recoveredApproval, actionId: pending.actionId };
      await new PostgresMockSavingsTools(recoveryStore.pool).createSavingsGoalAllocation({
        userId: allocationUserId,
        savingsEntryId: goal.savingsEntryId,
        amountCents: goal.amountCents,
        goalName: goal.goalName,
        approval,
        approvedActionId: pending.actionId
      });
    } finally {
      await recoveryStore.pool.end();
    }

    const resumedSecret = `${secondSecret}-goal-resume`;
    const resumedRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: resumedSecret });
    expect(resumedRuntime).not.toBeNull();
    const approved = await resumedRuntime!.handler(chatRequest(
      signVictoriaSession({ userId: allocationUserId, secret: resumedSecret }), approvalConversationId, "Yes"
    ), { conversationId: approvalConversationId });
    expect(approved.status).toBe(200);
    expect((await approved.json() as { decision: { action: string } }).decision.action).toBe("record_goal_allocation");

    const declineConversationId = `goal-decline-${randomUUID()}`;
    const declineToken = signVictoriaSession({ userId: allocationUserId, secret: resumedSecret });
    await resumedRuntime!.handler(chatRequest(declineToken, declineConversationId,
      "I almost bought an $18 game but decided to wait."), { conversationId: declineConversationId });
    await resumedRuntime!.handler(chatRequest(declineToken, declineConversationId, "Yes"), { conversationId: declineConversationId });
    const declineProposal = await resumedRuntime!.handler(chatRequest(declineToken, declineConversationId,
      "Put that toward my travel fund."), { conversationId: declineConversationId });
    expect((await declineProposal.json() as { decision: { action: string } }).decision.action).toBe("update_goal");

    const declineRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: `${resumedSecret}-decline` });
    expect(declineRuntime).not.toBeNull();
    const declineSession = signVictoriaSession({ userId: allocationUserId, secret: `${resumedSecret}-decline` });
    const declined = await declineRuntime!.handler(chatRequest(declineSession, declineConversationId, "No, not today."), {
      conversationId: declineConversationId
    });
    expect((await declined.json() as { decision: { action: string } }).decision.action).toBe("reflect");
    const laterYes = await declineRuntime!.handler(chatRequest(declineSession, declineConversationId, "Yes"), {
      conversationId: declineConversationId
    });
    expect((await laterYes.json() as { decision: { action: string } }).decision.action).not.toBe("record_goal_allocation");

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const actions = await store.pool.query<{ status: string; count: string }>(
        `SELECT t.status,
          (SELECT count(*)::text FROM victoria_local_savings_goal_allocations a
           WHERE a.user_id = t.user_id AND a.approved_action_id = t.action_id) AS count
         FROM victoria_local_goal_allocation_transitions t
         WHERE t.user_id = $1 AND t.conversation_id IN ($2, $3) ORDER BY t.conversation_id`,
        [allocationUserId, approvalConversationId, declineConversationId]
      );
      expect(actions.rows).toHaveLength(2);
      expect(actions.rows).toContainEqual({ status: "recorded", count: "1" });
      expect(actions.rows).toContainEqual({ status: "declined", count: "0" });
      const approvals = await store.pool.query<{ count: string }>(
        `SELECT count(*)::text FROM victoria_local_goal_allocation_action_approvals
         WHERE user_id = $1 AND action_id IN (
           SELECT action_id FROM victoria_local_goal_allocation_transitions
           WHERE user_id = $1 AND conversation_id = $2 AND status = 'recorded'
         )`,
        [allocationUserId, approvalConversationId]
      );
      expect(approvals.rows[0]?.count).toBe("1");
    } finally {
      await store.pool.end();
    }
  });

  it("serializes same-conversation turns across coordinators while allowing another conversation through", async () => {
    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 2 });
    const firstCoordinator = new PostgresConversationCoordinator(store.pool);
    const secondCoordinator = new PostgresConversationCoordinator(store.pool);
    let releaseFirst!: () => void;
    let markFirstEntered!: () => void;
    let markOtherEntered!: () => void;
    const firstEntered = new Promise<void>((resolve) => { markFirstEntered = resolve; });
    const otherEntered = new Promise<void>((resolve) => { markOtherEntered = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];

    try {
      const first = firstCoordinator.runExclusive(userId, "serialized-conversation", async () => {
        order.push("first-start");
        markFirstEntered();
        await store.pool.query("SELECT 1");
        await firstGate;
        order.push("first-end");
      });
      await firstEntered;
      const second = secondCoordinator.runExclusive(userId, "serialized-conversation", async () => {
        order.push("second-start");
      });
      const independent = secondCoordinator.runExclusive(userId, "independent-conversation", async () => {
        order.push("independent-start");
        markOtherEntered();
      });

      await otherEntered;
      expect(order).toContain("independent-start");
      expect(order).not.toContain("second-start");
      releaseFirst();
      await Promise.all([first, second, independent]);
      expect(order.indexOf("first-end")).toBeLessThan(order.indexOf("second-start"));
    } finally {
      releaseFirst();
      await store.pool.end();
    }
  });

  it("allows only one terminal outcome when approval and decline race across runtimes", async () => {
    const conversationId = `terminal-race-${randomUUID()}`;
    const raceUserId = `memory-check-${randomUUID()}`;
    const firstRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: firstSecret });
    const secondRuntime = getLocalMockVictoriaRuntime({ ...baseEnv, AUTH_SECRET: secondSecret });
    expect(firstRuntime).not.toBeNull();
    expect(secondRuntime).not.toBeNull();
    const proposed = await firstRuntime!.handler(chatRequest(
      signVictoriaSession({ userId: raceUserId, secret: firstSecret }),
      conversationId,
      "I almost bought a $19 notebook but decided to wait."
    ), { conversationId });
    expect((await proposed.json() as { message: string }).message).toContain("$19.00");

    const [approval, decline] = await Promise.all([
      firstRuntime!.handler(chatRequest(
        signVictoriaSession({ userId: raceUserId, secret: firstSecret }), conversationId, "Yes"
      ), { conversationId }),
      secondRuntime!.handler(chatRequest(
        signVictoriaSession({ userId: raceUserId, secret: secondSecret }), conversationId, "No"
      ), { conversationId })
    ]);
    expect(approval.status).toBe(200);
    expect(decline.status).toBe(200);

    const store = createPostgresTurnStore(databaseUrl!, { maxPoolSize: 1 });
    try {
      const counts = await store.pool.query<{ status: string; entry_count: string }>(
        `SELECT t.to_status AS status,
           (SELECT count(*)::text FROM victoria_local_savings_entries e WHERE e.user_id = t.user_id AND e.proposal_id = t.proposal_id) AS entry_count
         FROM victoria_local_savings_proposals p
         JOIN victoria_local_savings_proposal_transitions t USING (user_id, proposal_id)
         WHERE p.user_id = $1 AND p.conversation_id = $2`,
        [raceUserId, conversationId]
      );
      expect(counts.rows).toHaveLength(1);
      expect(["recorded", "declined"]).toContain(counts.rows[0]!.status);
      expect(Number(counts.rows[0]!.entry_count)).toBe(counts.rows[0]!.status === "recorded" ? 1 : 0);
    } finally {
      await store.pool.end();
    }
  });
});

function isSafeLocalDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) &&
      decodeURIComponent(url.pathname.slice(1)) === "victoria_integration_local";
  } catch {
    return false;
  }
}

function chatRequest(token: string, conversationId: string, message: string): Request {
  return new Request(`https://victoria.local/api/victoria/${conversationId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
}
