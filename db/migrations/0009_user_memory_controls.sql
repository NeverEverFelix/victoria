-- Explicit user forget requests may erase learned memories, while ordinary
-- corrections and financial history continue to use append-only records.
CREATE OR REPLACE FUNCTION victoria_reject_conversational_memory_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND
     current_setting('app.user_memory_forget_user', true) = OLD.user_id THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' AND current_setting('app.plaid_profile_purge_user', true) IS NOT NULL THEN
    IF TG_TABLE_NAME = 'victoria_conversational_memories' AND
       (OLD.user_id = current_setting('app.plaid_profile_purge_user', true) OR
        current_setting('app.plaid_profile_purge_user', true) = 'retention-job') THEN
      RETURN OLD;
    ELSIF TG_TABLE_NAME = 'victoria_memory_embeddings' AND
       (OLD.user_id = current_setting('app.plaid_profile_purge_user', true) OR
        current_setting('app.plaid_profile_purge_user', true) = 'retention-job') THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'conversational memory decisions are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION victoria_forget_conversational_memory(p_user_id text, p_memory_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  found_target boolean;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 OR
     p_memory_id IS NULL OR length(trim(p_memory_id)) = 0 THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.victoria_conversational_memories
    WHERE user_id = p_user_id AND id = p_memory_id
      AND source_type <> 'plaid_transaction_profile'
  ) INTO found_target;
  IF NOT found_target THEN RETURN false; END IF;

  PERFORM set_config('app.user_memory_forget_user', p_user_id, true);
  WITH RECURSIVE lineage(id) AS (
    SELECT p_memory_id
    UNION
    SELECT linked.id
    FROM lineage walk
    JOIN public.victoria_conversational_memories existing
      ON existing.user_id = p_user_id AND existing.id = walk.id
    JOIN public.victoria_conversational_memories linked
      ON linked.user_id = p_user_id
     AND (linked.supersedes_id = walk.id
       OR existing.supersedes_id = linked.id
       OR linked.source_metadata->>'correctionOfMemoryId' = walk.id)
  )
  DELETE FROM public.victoria_memory_embeddings e
  WHERE e.user_id = p_user_id AND e.memory_id IN (SELECT id FROM lineage);

  WITH RECURSIVE lineage(id) AS (
    SELECT p_memory_id
    UNION
    SELECT linked.id
    FROM lineage walk
    JOIN public.victoria_conversational_memories existing
      ON existing.user_id = p_user_id AND existing.id = walk.id
    JOIN public.victoria_conversational_memories linked
      ON linked.user_id = p_user_id
     AND (linked.supersedes_id = walk.id
       OR existing.supersedes_id = linked.id
       OR linked.source_metadata->>'correctionOfMemoryId' = walk.id)
  )
  DELETE FROM public.victoria_conversational_memories m
  WHERE m.user_id = p_user_id AND m.id IN (SELECT id FROM lineage);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION victoria_forget_conversational_memory(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION victoria_forget_conversational_memory(text, text) TO service_role;
