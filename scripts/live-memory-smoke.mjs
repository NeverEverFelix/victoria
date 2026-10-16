import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createServer } from "vite";

const connectionString = process.env.DATABASE_URL ??
  "postgresql://victoria:victoria_local_dev_only@127.0.0.1:54329/victoria_local";
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    decodeURIComponent(databaseUrl.pathname.slice(1)) !== "victoria_local") {
  throw new Error("The live memory smoke check only connects to the local victoria_local database.");
}

const mode = process.argv[2] ?? "demo";
const configuredUserId = process.env.VICTORIA_LIVE_DEMO_USER_ID;
const userId = configuredUserId ?? `local_memory_demo_${randomUUID()}`;
if (!/^local_memory_demo_[0-9a-f-]{36}$/.test(userId)) {
  throw new Error("The live demo accepts only its own generated synthetic user ID.");
}

function pass(label, detail = "") {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

const localSmokeEmbedder = {
  modelId: "local-live-smoke-hash-v1",
  async embed(text) {
    const vector = Array(1536).fill(0);
    for (const token of text.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) ?? []) {
      let hash = 2166136261;
      for (const character of token) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      vector[(hash >>> 0) % vector.length] += ((hash >>> 30) & 1) === 1 ? 1 : -1;
    }
    return vector;
  }
};

function requireDatabaseRowsZero(row, phase) {
  const fields = ["memories", "embeddings", "decisions", "contexts"];
  if (fields.some((field) => Number(row?.[field]) !== 0)) {
    throw new Error(`${phase}: synthetic rows remain in the local database.`);
  }
}

async function seedPhase() {
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3_000 });
  const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
  try {
    const [{ PostgresMemoryRepository }, { MemoryOrchestrator }, { buildTransactionFinancialProfile }] = await Promise.all([
      server.ssrLoadModule("/src/agent/memory/postgres-memory-repository.ts"),
      server.ssrLoadModule("/src/agent/memory/memory-orchestrator.ts"),
      server.ssrLoadModule("/src/domain/financial-profile.ts")
    ]);
    const repository = new PostgresMemoryRepository(pool, undefined, localSmokeEmbedder);
    const memory = new MemoryOrchestrator(repository, { financialProfiles: repository });

    await memory.rememberConversationalMemory(userId, {
      category: "goal", key: "emergency_fund",
      value: "The user wants to save money for an emergency fund.",
      evidence: "Synthetic prior statement stored by the seed process.", confidence: 1, sourceType: "user_statement"
    });
    await memory.rememberConversationalMemory(userId, {
      category: "habit", key: "takeout_routine",
      value: "Usually orders DoorDash when work runs late on Fridays.",
      evidence: "Synthetic prior statement stored by the seed process.", confidence: 0.92, sourceType: "user_statement"
    });
    await memory.rememberConversationalMemory(userId, {
      category: "preference", key: "preference:brief_practical_replies",
      value: "Prefers brief, practical guidance.",
      evidence: "Synthetic prior statement stored by the seed process.", confidence: 0.95, sourceType: "user_statement"
    });

    const now = new Date();
    const transactions = [650, 700, 750].map((amountCents, index) => ({
      transactionId: `synthetic_blue_bottle_${index}`,
      amountCents,
      isoCurrencyCode: "USD",
      date: new Date(now.getTime() - (index + 1) * 86_400_000).toISOString().slice(0, 10),
      merchantName: "Blue Bottle",
      category: "Coffee",
      pending: false
    }));
    const profile = buildTransactionFinancialProfile({ userId, now, transactions });
    await memory.rememberFinancialProfile(profile);

    const saved = await pool.query(
      `SELECT (SELECT count(*) FROM victoria_conversational_memories WHERE user_id = $1) AS memories,
              (SELECT count(*) FROM victoria_memory_embeddings WHERE user_id = $1) AS embeddings`, [userId]);
    if (Number(saved.rows[0]?.memories) !== 5 || Number(saved.rows[0]?.embeddings) !== 5) {
      throw new Error("Seed process did not persist three conversational facts and two transaction-profile facts with embeddings.");
    }
    console.log(`SEED PROCESS pid=${process.pid}: committed 3 synthetic user memories and 2 profile facts derived from 3 purchases.`);
    console.log("             This process exits before Victoria's chat turn starts.");
  } finally {
    await pool.end();
    await server.close();
  }
}

async function readAndChatPhase() {
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3_000 });
  const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
  let client;
  let transactionOpen = false;
  let failure;
  try {
    const [{ PostgresMemoryRepository }, { MemoryOrchestrator }, { VictoriaAgent }, { MockLlmAdapter }, { MockVictoriaTools }] = await Promise.all([
      server.ssrLoadModule("/src/agent/memory/postgres-memory-repository.ts"),
      server.ssrLoadModule("/src/agent/memory/memory-orchestrator.ts"),
      server.ssrLoadModule("/src/agent/victoria-agent.ts"),
      server.ssrLoadModule("/src/agent/llm/mock-llm.ts"),
      server.ssrLoadModule("/src/agent/tools/mock-tools.ts")
    ]);
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    let queryQueue = Promise.resolve();
    const transactionalDb = {
      query(sql, values = []) {
        const result = queryQueue.then(() => client.query(sql, values));
        queryQueue = result.then(() => undefined, () => undefined);
        return result;
      }
    };
    const repository = new PostgresMemoryRepository(transactionalDb, undefined, localSmokeEmbedder);
    const memory = new MemoryOrchestrator(repository, { financialProfiles: repository });
    const reflectionPrompt = "My week is stressful; I keep ordering takeout when work runs late and want a practical way to save money.";
    const loaded = await memory.getMemoryForUser(userId, reflectionPrompt);
    const loadedKeys = loaded.conversationalMemories?.map((item) => item.key) ?? [];
    const expectedKeys = ["takeout_routine", "emergency_fund", "preference:brief_practical_replies"];
    if (expectedKeys.some((key) => !loadedKeys.includes(key))) {
      throw new Error(`Fresh process could not retrieve the committed synthetic memory records. Retrieved: ${loadedKeys.join(", ")}`);
    }

    const databaseProfileProvider = {
      async findTypicalMerchantSpend({ userId: requestedUserId, merchantName }) {
        const normalizedMerchant = merchantName.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
        const key = `financial_profile:merchant:${normalizedMerchant}`;
        const result = await transactionalDb.query(
          `SELECT (source_metadata->>'typicalAmountCents')::integer AS amount_cents,
                  source_record_count AS transaction_count, observed_through::text AS observed_through
           FROM victoria_conversational_memories
           WHERE user_id = $1 AND memory_key = $2 AND source_type = 'plaid_transaction_profile'
             AND source_metadata->>'profileStatus' = 'active' AND observed_through >= current_date - 90
             AND NOT EXISTS (SELECT 1 FROM victoria_conversational_memories newer
               WHERE newer.user_id = victoria_conversational_memories.user_id
                 AND newer.supersedes_id = victoria_conversational_memories.id)
           ORDER BY created_at DESC LIMIT 1`, [requestedUserId, key]);
        const row = result.rows[0];
        return row ? { amountCents: Number(row.amount_cents), transactionCount: Number(row.transaction_count),
          observedThrough: row.observed_through } : null;
      }
    };
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, transactionHistory: databaseProfileProvider });

    console.log(`READ PROCESS pid=${process.pid}: fresh Node process; no seeding calls; loaded the committed records.`);
    console.log(`              Retrieved committed facts from Postgres: ${loadedKeys.join(", ")}`);
    console.log("\n──────────────── Victoria chat output ────────────────");

    const reflection = await agent.respond({ userId, conversationId: `reflection_${randomUUID()}`, message: reflectionPrompt });
    console.log(`You:       ${reflectionPrompt}`);
    console.log(`Victoria:  ${reflection.message}`);
    if (!reflection.message.includes("your takeout routine") ||
        !reflection.message.includes("your goal of saving for an emergency fund") ||
        !reflection.message.includes("your preference for brief practical replies")) {
      throw new Error("Victoria's reply did not use the committed synthetic routine, goal, and preference memories.");
    }
    pass("Database-backed personalization", "reply used facts read by a process that did not seed them");

    const savingsPrompt = "I made coffee at home instead of going to Blue Bottle.";
    const savings = await agent.respond({ userId, conversationId: `savings_${randomUUID()}`, message: savingsPrompt });
    console.log(`\nYou:       ${savingsPrompt}`);
    console.log(`Victoria:  ${savings.message}`);
    console.log(`Decision:  ${savings.decision.action}; source=${savings.decision.suggestion?.source ?? "none"}; ` +
      `approvalRequired=${savings.decision.toolCall?.requiresApproval ?? false}`);
    if (savings.decision.action !== "suggest_savings" || savings.decision.suggestion?.amountCents !== 700 ||
        savings.decision.suggestion.source !== "transaction_history" || savings.decision.toolCall?.requiresApproval !== true) {
      throw new Error("Victoria did not produce the expected approval-gated $7.00 suggestion from the committed profile.");
    }
    if ((await tools.listSavingsEntries(userId)).length !== 0) throw new Error("A ledger entry was created without approval.");
    pass("Profile-backed estimate", "$7.00 suggestion from persisted profile; no approval and no ledger entry");
    console.log("              Agent-generated context/decision writes are rolled back before this process exits.");
  } catch (error) {
    failure = error;
  } finally {
    if (transactionOpen) {
      await client.query("ROLLBACK");
      transactionOpen = false;
    }
    client?.release();
    await pool.end();
    await server.close();
  }
  if (failure) throw failure;
}

async function cleanupPhase() {
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3_000 });
  try {
    await pool.query("SELECT victoria_forget_all_conversational_memories($1)", [userId]);
    await pool.query("SELECT victoria_purge_plaid_profile_memories($1)", [userId]);
    await pool.query("DELETE FROM victoria_memory_settings WHERE user_id = $1", [userId]);
    const remaining = await pool.query(
      `SELECT (SELECT count(*) FROM victoria_conversational_memories WHERE user_id = $1) AS memories,
              (SELECT count(*) FROM victoria_memory_embeddings WHERE user_id = $1) AS embeddings,
              (SELECT count(*) FROM victoria_memory_decisions WHERE user_id = $1) AS decisions,
              (SELECT count(*) FROM victoria_conversation_context WHERE user_id = $1) AS contexts`, [userId]);
    requireDatabaseRowsZero(remaining.rows[0], "Cleanup");
    console.log(`CLEANUP PROCESS pid=${process.pid}: removed the synthetic user's stored rows.`);
    pass("Cleanup", "zero synthetic memory, embedding, decision, or context rows remain");
  } finally {
    await pool.end();
  }
}

async function main() {
  if (mode === "seed") return seedPhase();
  if (mode === "read") return readAndChatPhase();
  if (mode === "cleanup") return cleanupPhase();
  if (mode !== "demo") throw new Error(`Unknown live-memory-smoke mode: ${mode}`);

  console.log("\nVictoria persisted-memory proof (three separate Node processes)");
  console.log(`  Database: ${databaseUrl.hostname}:${databaseUrl.port || "5432"}/${decodeURIComponent(databaseUrl.pathname.slice(1))}`);
  console.log("  Demo data: synthetic only; deterministic embeddings; no Plaid or external API calls");
  console.log("  Proof: seed commits and exits; a fresh process reads and chats without seeding; cleanup deletes the demo data.\n");

  const scriptPath = fileURLToPath(import.meta.url);
  const phaseEnv = { ...process.env, VICTORIA_LIVE_DEMO_USER_ID: userId };
  const runPhase = (phase) => {
    const result = spawnSync(process.execPath, [scriptPath, phase], { cwd: process.cwd(), env: phaseEnv, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${phase} phase exited with status ${result.status}.`);
  };

  let failure;
  try {
    runPhase("seed");
    runPhase("read");
  } catch (error) {
    failure = error;
  } finally {
    try { runPhase("cleanup"); }
    catch (cleanupError) { failure ??= cleanupError; }
  }
  if (failure) throw failure;
  console.log("\nResult: Victoria recalled committed database memory in a separate process.\n");
}

main().catch((error) => {
  console.error(`\nFAIL  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
