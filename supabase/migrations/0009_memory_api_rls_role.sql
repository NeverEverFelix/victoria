-- The server connects with the Supabase postgres credential, which can bypass
-- RLS. Switch memory statements into this non-login, non-owner role and bind
-- the verified Supabase subject through transaction-local request context.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'victoria_memory_api') THEN
    -- PostgreSQL defaults new roles to NOSUPERUSER, NOCREATEDB,
    -- NOCREATEROLE, and NOBYPASSRLS. Explicitly set only allowed attributes.
    CREATE ROLE victoria_memory_api NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT victoria_memory_api TO postgres;
GRANT USAGE ON SCHEMA public, extensions TO victoria_memory_api;
GRANT USAGE ON TYPE extensions.vector TO victoria_memory_api;
GRANT SELECT, INSERT ON victoria_conversational_memories, victoria_memory_embeddings TO victoria_memory_api;
GRANT EXECUTE ON FUNCTION victoria_search_conversational_memories(text, extensions.vector, text, integer)
  TO victoria_memory_api;

DROP POLICY IF EXISTS victoria_conversational_memories_api_owner_policy ON victoria_conversational_memories;
CREATE POLICY victoria_conversational_memories_api_owner_policy ON victoria_conversational_memories
  FOR ALL TO victoria_memory_api
  USING (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''))
  WITH CHECK (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));

DROP POLICY IF EXISTS victoria_memory_embeddings_api_owner_policy ON victoria_memory_embeddings;
CREATE POLICY victoria_memory_embeddings_api_owner_policy ON victoria_memory_embeddings
  FOR ALL TO victoria_memory_api
  USING (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''))
  WITH CHECK (user_id = NULLIF(current_setting('request.jwt.claim.sub', true), ''));
