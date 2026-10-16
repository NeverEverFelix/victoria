-- Supabase/pgvector-backed semantic recall for durable conversational and
-- transaction-derived financial profile facts. Embeddings are versioned by model.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE victoria_conversational_memories
  DROP CONSTRAINT IF EXISTS victoria_conversational_memories_category_check;
ALTER TABLE victoria_conversational_memories
  ADD CONSTRAINT victoria_conversational_memories_category_check
    CHECK (category IN ('preference', 'goal', 'habit', 'other', 'financial_pattern'));

ALTER TABLE victoria_conversational_memories
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user_statement'
    CHECK (source_type IN ('user_statement', 'plaid_transaction_profile', 'system_inference', 'user_correction')),
  ADD COLUMN IF NOT EXISTS observed_from date,
  ADD COLUMN IF NOT EXISTS observed_through date,
  ADD COLUMN IF NOT EXISTS source_record_count integer,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT victoria_memory_observation_window_check
    CHECK (observed_from IS NULL OR observed_through IS NULL OR observed_from <= observed_through),
  ADD CONSTRAINT victoria_memory_source_record_count_check
    CHECK (source_record_count IS NULL OR source_record_count > 0),
  ADD CONSTRAINT victoria_memory_source_metadata_object_check
    CHECK (jsonb_typeof(source_metadata) = 'object');

CREATE TABLE IF NOT EXISTS victoria_memory_embeddings (
  user_id text NOT NULL,
  memory_id text NOT NULL,
  embedding_model text NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  embedded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, memory_id, embedding_model),
  FOREIGN KEY (user_id, memory_id)
    REFERENCES victoria_conversational_memories(user_id, id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(embedding_model)) > 0)
);

CREATE INDEX IF NOT EXISTS victoria_memory_embeddings_user_model_idx
  ON victoria_memory_embeddings (user_id, embedding_model);

CREATE INDEX IF NOT EXISTS victoria_memory_embeddings_hnsw_idx
  ON victoria_memory_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

-- A memory can be replaced by a newer linked fact, but historical facts remain
-- available for audit and are excluded from current semantic recall.
CREATE OR REPLACE FUNCTION victoria_search_conversational_memories(
  p_user_id text,
  p_query extensions.vector(1536),
  p_embedding_model text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  category text,
  key text,
  value text,
  evidence text,
  confidence double precision,
  created_at timestamptz,
  supersedes_id text,
  source_type text,
  observed_from date,
  observed_through date,
  source_record_count integer,
  source_metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT m.id, m.category, m.memory_key, m.value, m.evidence, m.confidence,
    m.created_at, m.supersedes_id, m.source_type, m.observed_from,
    m.observed_through, m.source_record_count, m.source_metadata,
    1 - (e.embedding <=> p_query) AS similarity
  FROM public.victoria_memory_embeddings e
  JOIN public.victoria_conversational_memories m
    ON m.user_id = e.user_id AND m.id = e.memory_id
  WHERE e.user_id = p_user_id
    AND e.embedding_model = p_embedding_model
    AND (m.source_type <> 'plaid_transaction_profile' OR m.observed_through >= current_date - 90)
    AND NOT EXISTS (
      SELECT 1 FROM public.victoria_conversational_memories newer
      WHERE newer.user_id = m.user_id AND newer.supersedes_id = m.id
    )
  ORDER BY e.embedding <=> p_query
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Supabase clients can only access a user's own durable memory and embeddings.
ALTER TABLE victoria_conversational_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_memory_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_conversation_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS victoria_conversational_memories_owner_policy ON victoria_conversational_memories;
CREATE POLICY victoria_conversational_memories_owner_policy ON victoria_conversational_memories
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS victoria_memory_embeddings_owner_policy ON victoria_memory_embeddings;
CREATE POLICY victoria_memory_embeddings_owner_policy ON victoria_memory_embeddings
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS victoria_memory_decisions_owner_policy ON victoria_memory_decisions;
CREATE POLICY victoria_memory_decisions_owner_policy ON victoria_memory_decisions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS victoria_conversation_context_owner_policy ON victoria_conversation_context;
CREATE POLICY victoria_conversation_context_owner_policy ON victoria_conversation_context
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

DROP TRIGGER IF EXISTS victoria_memory_embeddings_immutable ON victoria_memory_embeddings;
CREATE TRIGGER victoria_memory_embeddings_immutable
  BEFORE UPDATE OR DELETE ON victoria_memory_embeddings
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_conversational_memory_mutation();

REVOKE ALL ON FUNCTION victoria_search_conversational_memories(text, extensions.vector, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE USAGE ON SCHEMA extensions FROM anon;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION victoria_search_conversational_memories(text, extensions.vector, text, integer)
  TO authenticated, service_role;
GRANT SELECT ON victoria_conversational_memories, victoria_memory_embeddings TO authenticated;
GRANT SELECT ON victoria_memory_decisions, victoria_conversation_context TO authenticated;
GRANT ALL ON victoria_conversational_memories, victoria_memory_embeddings,
  victoria_memory_decisions, victoria_conversation_context TO service_role;
