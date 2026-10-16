-- Disconnecting a Plaid profile also removes user corrections that reference
-- profile-derived facts, not only records linked through supersedes_id.
CREATE OR REPLACE FUNCTION public.victoria_purge_plaid_profile_memories(p_user_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  removed_memories integer;
  removed_embeddings integer;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  PERFORM set_config('app.plaid_profile_purge_user', p_user_id, true);
  WITH RECURSIVE doomed(id) AS (
    SELECT id FROM public.victoria_conversational_memories
    WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile'
    UNION
    SELECT linked.id
    FROM doomed parent
    JOIN public.victoria_conversational_memories linked
      ON linked.user_id = p_user_id
     AND (linked.supersedes_id = parent.id
       OR linked.source_metadata->>'correctionOfMemoryId' = parent.id)
  )
  DELETE FROM public.victoria_memory_embeddings e
  WHERE e.user_id = p_user_id AND e.memory_id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS removed_embeddings = ROW_COUNT;

  WITH RECURSIVE doomed(id) AS (
    SELECT id FROM public.victoria_conversational_memories
    WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile'
    UNION
    SELECT linked.id
    FROM doomed parent
    JOIN public.victoria_conversational_memories linked
      ON linked.user_id = p_user_id
     AND (linked.supersedes_id = parent.id
       OR linked.source_metadata->>'correctionOfMemoryId' = parent.id)
  )
  DELETE FROM public.victoria_conversational_memories m
  WHERE m.user_id = p_user_id AND m.id IN (SELECT id FROM doomed);
  GET DIAGNOSTICS removed_memories = ROW_COUNT;
  RETURN removed_memories + removed_embeddings;
END;
$$;
REVOKE ALL ON FUNCTION public.victoria_purge_plaid_profile_memories(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.victoria_purge_plaid_profile_memories(text) TO service_role;
