-- Retention policy:
-- * user-stated memories remain until selected forget, Forget all, or account deletion;
-- * episodic summaries expire 90 days after creation;
-- * current transaction-profile facts expire 90 days after observation, along
--   with linked user corrections; a newer current profile fact keeps its
--   superseded history available until profile disconnect/delete.
-- All source and vector deletion happens in the same transaction.
CREATE OR REPLACE FUNCTION public.victoria_expire_plaid_data(p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  removed_transactions integer;
  removed_memories integer;
  removed_embeddings integer;
BEGIN
  DELETE FROM public.victoria_plaid_transactions WHERE expires_at <= p_now;
  GET DIAGNOSTICS removed_transactions = ROW_COUNT;

  PERFORM set_config('app.plaid_profile_purge_user', 'retention-job', true);
  WITH RECURSIVE expired_roots(id, user_id) AS (
    SELECT m.id, m.user_id
    FROM public.victoria_conversational_memories m
    WHERE m.source_type = 'plaid_transaction_profile'
      AND coalesce(m.observed_through, (m.created_at AT TIME ZONE 'UTC')::date)
        < ((p_now AT TIME ZONE 'UTC')::date - 90)
      AND NOT EXISTS (
        SELECT 1 FROM public.victoria_conversational_memories fresh
        WHERE fresh.user_id = m.user_id
          AND fresh.memory_key = m.memory_key
          AND fresh.source_type = 'plaid_transaction_profile'
          AND coalesce(fresh.observed_through, (fresh.created_at AT TIME ZONE 'UTC')::date)
            >= ((p_now AT TIME ZONE 'UTC')::date - 90)
      )
    UNION
    SELECT m.id, m.user_id
    FROM public.victoria_conversational_memories m
    WHERE m.category = 'other'
      AND m.source_type = 'system_inference'
      AND m.source_metadata->>'memoryKind' = 'episodic_summary'
      AND m.created_at < p_now - interval '90 days'
  ), expired_lineage(id, user_id) AS (
    SELECT id, user_id FROM expired_roots
    UNION
    SELECT child.id, child.user_id
    FROM expired_lineage parent
    JOIN public.victoria_conversational_memories child
      ON child.user_id = parent.user_id
     AND (child.supersedes_id = parent.id
       OR child.source_metadata->>'correctionOfMemoryId' = parent.id)
  )
  DELETE FROM public.victoria_memory_embeddings e
  WHERE EXISTS (SELECT 1 FROM expired_lineage d WHERE d.user_id=e.user_id AND d.id=e.memory_id);
  GET DIAGNOSTICS removed_embeddings = ROW_COUNT;

  WITH RECURSIVE expired_roots(id, user_id) AS (
    SELECT m.id, m.user_id
    FROM public.victoria_conversational_memories m
    WHERE m.source_type = 'plaid_transaction_profile'
      AND coalesce(m.observed_through, (m.created_at AT TIME ZONE 'UTC')::date)
        < ((p_now AT TIME ZONE 'UTC')::date - 90)
      AND NOT EXISTS (
        SELECT 1 FROM public.victoria_conversational_memories fresh
        WHERE fresh.user_id = m.user_id
          AND fresh.memory_key = m.memory_key
          AND fresh.source_type = 'plaid_transaction_profile'
          AND coalesce(fresh.observed_through, (fresh.created_at AT TIME ZONE 'UTC')::date)
            >= ((p_now AT TIME ZONE 'UTC')::date - 90)
      )
    UNION
    SELECT m.id, m.user_id
    FROM public.victoria_conversational_memories m
    WHERE m.category = 'other'
      AND m.source_type = 'system_inference'
      AND m.source_metadata->>'memoryKind' = 'episodic_summary'
      AND m.created_at < p_now - interval '90 days'
  ), expired_lineage(id, user_id) AS (
    SELECT id, user_id FROM expired_roots
    UNION
    SELECT child.id, child.user_id
    FROM expired_lineage parent
    JOIN public.victoria_conversational_memories child
      ON child.user_id = parent.user_id
     AND (child.supersedes_id = parent.id
       OR child.source_metadata->>'correctionOfMemoryId' = parent.id)
  )
  DELETE FROM public.victoria_conversational_memories m
  WHERE EXISTS (SELECT 1 FROM expired_lineage d WHERE d.user_id=m.user_id AND d.id=m.id);
  GET DIAGNOSTICS removed_memories = ROW_COUNT;
  RETURN removed_transactions + removed_memories + removed_embeddings;
END;
$$;

REVOKE ALL ON FUNCTION public.victoria_expire_plaid_data(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.victoria_expire_plaid_data(timestamptz) TO service_role;
