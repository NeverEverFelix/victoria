import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0009_user_memory_controls.sql", import.meta.url), "utf8");
const purgeFunction = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION victoria_forget_conversational_memory"));
const retentionMigration = readFileSync(new URL("../../db/migrations/0013_memory_retention.sql", import.meta.url), "utf8");
const retrievalPermissionsMigration = readFileSync(new URL("../../db/migrations/0014_semantic_search_permissions.sql", import.meta.url), "utf8");
const semanticMigration = readFileSync(new URL("../../db/migrations/0004_semantic_user_memory.sql", import.meta.url), "utf8");
const memorySettingsMigration = readFileSync(new URL("../../db/migrations/0010_memory_controls_settings.sql", import.meta.url), "utf8");
const savingsGoalsMigration = readFileSync(new URL("../../db/migrations/0012_savings_goals.sql", import.meta.url), "utf8");

describe("user memory controls contract", () => {
  it("MEM-008 permits deletion only through a user-scoped forget operation", () => {
    expect(migration).toMatch(/victoria_forget_conversational_memory\(p_user_id text, p_memory_id text\)/i);
    expect(migration).toMatch(/user_id = p_user_id AND id = p_memory_id/i);
    expect(migration).toMatch(/source_type <> 'plaid_transaction_profile'/i);
    expect(migration).toMatch(/app\.user_memory_forget_user/i);
    expect(migration).toMatch(/DELETE FROM public\.victoria_memory_embeddings/i);
    expect(migration).toMatch(/DELETE FROM public\.victoria_conversational_memories/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION victoria_forget_conversational_memory\(text, text\) FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION victoria_forget_conversational_memory\(text, text\) TO service_role/i);
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = pg_catalog, public/i);
    expect(purgeFunction).toMatch(/e\.user_id = p_user_id AND e\.memory_id IN \(SELECT id FROM lineage\)/i);
    expect(purgeFunction).toMatch(/linked\.source_metadata->>'correctionOfMemoryId' = walk\.id/i);
    expect(migration).not.toMatch(/DELETE FROM public\.victoria_(memory_decisions|savings|financial_events)/i);
  });
});

describe("server-only memory and goal table writes", () => {
  it("MEM-011 leaves pause settings and goal writes behind the trusted server role", () => {
    expect(memorySettingsMigration).not.toMatch(/CREATE POLICY[\s\S]*TO authenticated/i);
    expect(memorySettingsMigration).toMatch(/GRANT ALL ON public\.victoria_memory_settings TO service_role/i);
    expect(savingsGoalsMigration).toMatch(/FOR SELECT TO authenticated/i);
    expect(savingsGoalsMigration).toMatch(/REVOKE ALL ON victoria_savings_goals FROM anon, authenticated/i);
    expect(savingsGoalsMigration).toMatch(/GRANT ALL ON victoria_savings_goals TO service_role/i);
  });
});

describe("memory retention contract", () => {
  it("MEM-009 expires stale profile and episodic facts with their embeddings under service-role-only execution", () => {
    expect(retentionMigration).toMatch(/victoria_expire_plaid_data\(p_now timestamptz DEFAULT now\(\)\)/i);
    expect(retentionMigration).toMatch(/observed_through[\s\S]*- 90/i);
    expect(retentionMigration).toMatch(/memoryKind' = 'episodic_summary'[\s\S]*interval '90 days'/i);
    expect(retentionMigration).toMatch(/child\.source_metadata->>'correctionOfMemoryId' = parent\.id::text/i);
    expect(retentionMigration).toMatch(/DELETE FROM public\.victoria_memory_embeddings[\s\S]*DELETE FROM public\.victoria_conversational_memories/i);
    expect(retentionMigration).toMatch(/REVOKE ALL ON FUNCTION public\.victoria_expire_plaid_data\(timestamptz\) FROM PUBLIC/i);
    expect(retentionMigration).toMatch(/pg_catalog\.pg_roles[\s\S]*rolname = 'service_role'[\s\S]*GRANT EXECUTE ON FUNCTION public\.victoria_expire_plaid_data/i);
    expect(retentionMigration).toMatch(/SET search_path = pg_catalog AS/i);
    expect(retentionMigration).toContain("user-stated memories remain until selected forget, Forget all, or account deletion");
  });

  it("MEM-010 grants semantic retrieval only to authenticated and server roles", () => {
    expect(semanticMigration).toMatch(/REVOKE USAGE ON SCHEMA extensions FROM PUBLIC, anon/i);
    expect(semanticMigration).toMatch(/GRANT USAGE ON SCHEMA extensions TO authenticated, service_role/i);
    expect(retrievalPermissionsMigration).toMatch(/REVOKE ALL ON FUNCTION public\.victoria_search_conversational_memories[\s\S]*FROM PUBLIC/i);
    expect(retrievalPermissionsMigration).toMatch(/pg_catalog\.pg_roles[\s\S]*rolname = 'anon'[\s\S]*REVOKE USAGE ON SCHEMA extensions FROM anon/i);
    expect(retrievalPermissionsMigration).toMatch(/GRANT USAGE ON SCHEMA extensions TO authenticated/i);
    expect(retrievalPermissionsMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.victoria_search_conversational_memories[\s\S]*TO authenticated/i);
    expect(retrievalPermissionsMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.victoria_search_conversational_memories[\s\S]*TO service_role/i);
  });
});
