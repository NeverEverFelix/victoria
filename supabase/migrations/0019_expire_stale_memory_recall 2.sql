-- Logical expiry must work even if the physical retention scheduler is delayed.
CREATE OR REPLACE FUNCTION victoria_search_conversational_memories(
  p_user_id text,
  p_query extensions.vector(1536),
  p_embedding_model text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text, category text, key text, value text, evidence text, confidence double precision,
  created_at timestamptz, supersedes_id text, source_type text, observed_from date,
  observed_through date, source_record_count integer, source_metadata jsonb, similarity double precision
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public, extensions
AS $$
  SELECT m.id, m.category, m.memory_key, m.value, m.evidence, m.confidence,
    m.created_at, m.supersedes_id, m.source_type, m.observed_from, m.observed_through,
    m.source_record_count, m.source_metadata, 1 - (e.embedding <=> p_query) AS similarity
  FROM public.victoria_memory_embeddings e
  JOIN public.victoria_conversational_memories m ON m.user_id = e.user_id AND m.id = e.memory_id
  WHERE e.user_id = p_user_id AND e.embedding_model = p_embedding_model
    AND (m.source_type <> 'plaid_transaction_profile' OR m.observed_through >= current_date - 90)
    AND (m.source_type = 'plaid_transaction_profile' OR m.created_at >= now() - interval '24 months')
    AND m.source_metadata->>'memoryStatus' IS DISTINCT FROM 'forgotten'
    AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories newer
      WHERE newer.user_id = m.user_id AND newer.supersedes_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories forgotten
      WHERE forgotten.user_id = m.user_id AND forgotten.category = m.category
        AND forgotten.memory_key = m.memory_key AND forgotten.source_metadata->>'memoryStatus' = 'forgotten'
        AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories restored
          WHERE restored.user_id = forgotten.user_id AND restored.supersedes_id = forgotten.id))
  ORDER BY e.embedding <=> p_query
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;
REVOKE ALL ON FUNCTION victoria_search_conversational_memories(text, extensions.vector, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION victoria_search_conversational_memories(text, extensions.vector, text, integer)
  TO authenticated, service_role, victoria_memory_api;
