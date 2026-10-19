-- These tables contain per-user conversations and authorization history. They are
-- accessed only by trusted server runtimes, never directly through PostgREST.
ALTER TABLE victoria_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_plaid_consent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE victoria_turns, victoria_plaid_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE victoria_turns TO service_role;
GRANT SELECT, INSERT ON TABLE victoria_plaid_consent_events TO service_role;

REVOKE ALL ON SEQUENCE victoria_plaid_consent_events_sequence_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE victoria_plaid_consent_events_sequence_id_seq TO service_role;

-- Make the memory API role's policy surface match its SELECT/INSERT grants.
DROP POLICY IF EXISTS victoria_conversational_memories_api_owner_policy ON victoria_conversational_memories;
DROP POLICY IF EXISTS victoria_conversational_memories_api_select_policy ON victoria_conversational_memories;
DROP POLICY IF EXISTS victoria_conversational_memories_api_insert_policy ON victoria_conversational_memories;
CREATE POLICY victoria_conversational_memories_api_select_policy ON victoria_conversational_memories
  FOR SELECT TO victoria_memory_api
  USING (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));
CREATE POLICY victoria_conversational_memories_api_insert_policy ON victoria_conversational_memories
  FOR INSERT TO victoria_memory_api
  WITH CHECK (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));

DROP POLICY IF EXISTS victoria_memory_embeddings_api_owner_policy ON victoria_memory_embeddings;
DROP POLICY IF EXISTS victoria_memory_embeddings_api_select_policy ON victoria_memory_embeddings;
DROP POLICY IF EXISTS victoria_memory_embeddings_api_insert_policy ON victoria_memory_embeddings;
CREATE POLICY victoria_memory_embeddings_api_select_policy ON victoria_memory_embeddings
  FOR SELECT TO victoria_memory_api
  USING (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));
CREATE POLICY victoria_memory_embeddings_api_insert_policy ON victoria_memory_embeddings
  FOR INSERT TO victoria_memory_api
  WITH CHECK (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));
