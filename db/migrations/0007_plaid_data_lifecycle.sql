-- Raw Transactions rows expire after the approved 90-day profile window.
ALTER TABLE victoria_plaid_transactions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE victoria_plaid_transactions
  SET expires_at = ((transaction_date + 90)::timestamp AT TIME ZONE 'UTC')
  WHERE expires_at IS NULL;
ALTER TABLE victoria_plaid_transactions
  ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS victoria_plaid_transactions_expiry_idx
  ON victoria_plaid_transactions(expires_at);

ALTER TABLE victoria_plaid_items
  ADD COLUMN IF NOT EXISTS disconnect_requested_at timestamptz;

-- Retain only encrypted credentials needed to retry Plaid Item revocation after
-- local access is disabled and transaction data has been removed.
CREATE TABLE IF NOT EXISTS victoria_plaid_revocation_queue (
  user_id text NOT NULL,
  item_id text NOT NULL PRIMARY KEY,
  access_token_ciphertext text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_auth_tag text NOT NULL,
  encryption_key_version text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(user_id)) > 0)
);
CREATE INDEX IF NOT EXISTS victoria_plaid_revocation_due_idx
  ON victoria_plaid_revocation_queue(next_attempt_at);
ALTER TABLE victoria_plaid_revocation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY victoria_plaid_revocation_queue_service_role
  ON victoria_plaid_revocation_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON victoria_plaid_revocation_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON victoria_plaid_revocation_queue TO service_role;

-- Profile data is derived and may be erased for source deletion/retention. All
-- other conversational and financial history remains append-only.
CREATE OR REPLACE FUNCTION victoria_reject_conversational_memory_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.plaid_profile_purge_user', true) IS NOT NULL THEN
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

CREATE OR REPLACE FUNCTION victoria_purge_plaid_profile_memories(p_user_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE removed integer;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  PERFORM set_config('app.plaid_profile_purge_user', p_user_id, true);
  -- A correction or refreshed profile can point at an older derived profile
  -- fact. Remove only that linked lineage as part of source-data deletion.
  DELETE FROM public.victoria_memory_embeddings e
    USING (
      WITH RECURSIVE doomed(id, user_id) AS (
        SELECT id, user_id FROM public.victoria_conversational_memories
          WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile'
        UNION
        SELECT child.id, child.user_id FROM public.victoria_conversational_memories child
          JOIN doomed parent ON child.user_id = parent.user_id AND child.supersedes_id = parent.id
      ) SELECT id, user_id FROM doomed
    ) d
    WHERE e.user_id = d.user_id AND e.memory_id = d.id;
  DELETE FROM public.victoria_conversational_memories
    WHERE user_id = p_user_id AND id IN (
      WITH RECURSIVE doomed(id) AS (
        SELECT id FROM public.victoria_conversational_memories
          WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile'
        UNION
        SELECT child.id FROM public.victoria_conversational_memories child
          JOIN doomed parent ON child.user_id = p_user_id AND child.supersedes_id = parent.id
      ) SELECT id FROM doomed
    );
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION victoria_purge_plaid_profile_memories(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION victoria_purge_plaid_profile_memories(text) TO service_role;

CREATE OR REPLACE FUNCTION victoria_expire_plaid_data(p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.victoria_plaid_transactions WHERE expires_at <= p_now;
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('app.plaid_profile_purge_user', 'retention-job', true);
  DELETE FROM public.victoria_memory_embeddings e
    USING public.victoria_conversational_memories m
    WHERE e.user_id = m.user_id AND e.memory_id = m.id
      AND m.source_type = 'plaid_transaction_profile'
      AND coalesce(m.observed_through, m.created_at::date) < (p_now::date - 90)
      AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories child
        WHERE child.user_id=m.user_id AND child.supersedes_id=m.id);
  DELETE FROM public.victoria_conversational_memories m
    WHERE m.source_type = 'plaid_transaction_profile'
      AND coalesce(m.observed_through, m.created_at::date) < (p_now::date - 90)
      AND NOT EXISTS (SELECT 1 FROM public.victoria_conversational_memories child
        WHERE child.user_id=m.user_id AND child.supersedes_id=m.id);
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION victoria_expire_plaid_data(timestamptz) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION victoria_expire_plaid_data(timestamptz) TO service_role;
