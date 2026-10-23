-- Scheduled lifecycle maintenance for chat context and conversational memories.
-- Unforgotten user facts expire 24 months after their latest linked revision.
-- A forgotten fact stops recall immediately and its full lineage is hard-purged
-- after a 30-day recovery window. Transaction-profile facts retain the existing
-- 90-day policy in victoria_expire_plaid_data().
CREATE TABLE IF NOT EXISTS victoria_retention_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  deleted_context_rows integer NOT NULL DEFAULT 0 CHECK (deleted_context_rows >= 0),
  deleted_memory_rows integer NOT NULL DEFAULT 0 CHECK (deleted_memory_rows >= 0),
  deleted_embedding_rows integer NOT NULL DEFAULT 0 CHECK (deleted_embedding_rows >= 0),
  deleted_profile_rows integer NOT NULL DEFAULT 0 CHECK (deleted_profile_rows >= 0),
  error_code text
);
CREATE INDEX IF NOT EXISTS victoria_retention_runs_started_idx
  ON victoria_retention_runs(started_at DESC);
ALTER TABLE victoria_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON victoria_retention_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON victoria_retention_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE victoria_retention_runs_id_seq TO service_role;

CREATE OR REPLACE FUNCTION victoria_run_memory_retention(p_now timestamptz DEFAULT now())
RETURNS TABLE (
  run_id bigint,
  status text,
  deleted_context_rows integer,
  deleted_memory_rows integer,
  deleted_embedding_rows integer,
  deleted_profile_rows integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_run_id bigint;
  v_context integer := 0;
  v_memories integer := 0;
  v_embeddings integer := 0;
  v_profiles integer := 0;
  v_error text;
BEGIN
  INSERT INTO public.victoria_retention_runs(job_name, status)
    VALUES ('memory_retention', 'running') RETURNING id INTO v_run_id;
  BEGIN
    DELETE FROM public.victoria_conversation_context WHERE expires_at <= p_now;
    GET DIAGNOSTICS v_context = ROW_COUNT;

    -- This existing, audited lifecycle function removes expired Plaid source
    -- transactions and their derived profile-fact lineage and embeddings.
    v_profiles := public.victoria_expire_plaid_data(p_now);

    -- A current forgotten marker is purge eligible after 30 days. A current
    -- ordinary user fact is purge eligible after 24 months without revision.
    -- Delete its entire linked lineage and every embedding in the same txn.
    PERFORM set_config('app.plaid_profile_purge_user', 'retention-job', true);
    WITH RECURSIVE purge_lineage(user_id, id, supersedes_id) AS (
      SELECT leaf.user_id, leaf.id, leaf.supersedes_id
      FROM public.victoria_conversational_memories leaf
      WHERE leaf.source_type <> 'plaid_transaction_profile'
        AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories child
          WHERE child.user_id = leaf.user_id AND child.supersedes_id = leaf.id)
        AND ((leaf.source_metadata->>'memoryStatus' = 'forgotten'
              AND leaf.created_at <= p_now - interval '30 days')
          OR (leaf.source_metadata->>'memoryStatus' IS DISTINCT FROM 'forgotten'
              AND leaf.created_at <= p_now - interval '24 months'))
      UNION
      SELECT parent.user_id, parent.id, parent.supersedes_id
      FROM public.victoria_conversational_memories parent
      JOIN purge_lineage child ON child.user_id = parent.user_id AND child.supersedes_id = parent.id
    ), removed_embeddings AS (
      DELETE FROM public.victoria_memory_embeddings e
      USING purge_lineage p
      WHERE e.user_id = p.user_id AND e.memory_id = p.id
      RETURNING 1
    ), removed_memories AS (
      DELETE FROM public.victoria_conversational_memories m
      USING purge_lineage p
      WHERE m.user_id = p.user_id AND m.id = p.id
      RETURNING 1
    )
    SELECT (SELECT count(*)::integer FROM removed_embeddings),
           (SELECT count(*)::integer FROM removed_memories)
      INTO v_embeddings, v_memories;

    UPDATE public.victoria_retention_runs SET completed_at = p_now, status = 'succeeded',
      deleted_context_rows = v_context, deleted_memory_rows = v_memories,
      deleted_embedding_rows = v_embeddings, deleted_profile_rows = v_profiles
      WHERE id = v_run_id;
    RETURN QUERY SELECT v_run_id, 'succeeded'::text, v_context, v_memories, v_embeddings, v_profiles;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = RETURNED_SQLSTATE;
    UPDATE public.victoria_retention_runs SET completed_at = p_now, status = 'failed', error_code = v_error
      WHERE id = v_run_id;
    RETURN QUERY SELECT v_run_id, 'failed'::text, 0, 0, 0, 0;
  END;
END;
$$;
REVOKE ALL ON FUNCTION victoria_run_memory_retention(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION victoria_run_memory_retention(timestamptz) TO service_role;
