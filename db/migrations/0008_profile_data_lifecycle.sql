-- Approved lifecycle defaults: raw transaction rows are capped at 90 days;
-- disconnect removes Plaid data while preserving user-authored memory.
ALTER TABLE victoria_plaid_items
  ADD COLUMN IF NOT EXISTS disconnect_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION victoria_reject_plaid_consent_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('victoria.consent_erasure_user', true) = OLD.user_id THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Plaid consent events are append-only outside controlled account erasure';
END;
$$;

CREATE OR REPLACE FUNCTION victoria_reject_conversational_memory_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  controlled_user text := current_setting('victoria.plaid_profile_erasure_user', true);
BEGIN
  IF TG_TABLE_NAME = 'victoria_memory_decisions' THEN
    RAISE EXCEPTION 'conversational memory decisions are append-only';
  END IF;
  IF TG_TABLE_NAME = 'victoria_memory_embeddings' THEN
    IF TG_OP = 'DELETE' AND OLD.user_id = controlled_user AND EXISTS (
      SELECT 1 FROM victoria_conversational_memories m
       WHERE m.user_id = OLD.user_id AND m.id = OLD.memory_id AND m.source_type = 'plaid_transaction_profile'
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'memory embeddings are append-only outside Plaid profile erasure';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.user_id = controlled_user AND OLD.source_type = 'plaid_transaction_profile' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id = controlled_user AND NEW.user_id = OLD.user_id
     AND OLD.source_type <> 'plaid_transaction_profile' AND NEW.source_type = OLD.source_type
     AND NEW.id = OLD.id AND NEW.category = OLD.category AND NEW.memory_key = OLD.memory_key
     AND NEW.value = OLD.value AND NEW.evidence = OLD.evidence AND NEW.confidence = OLD.confidence
     AND NEW.created_at = OLD.created_at AND NEW.observed_from IS NOT DISTINCT FROM OLD.observed_from
     AND NEW.observed_through IS NOT DISTINCT FROM OLD.observed_through
     AND NEW.source_record_count IS NOT DISTINCT FROM OLD.source_record_count
     AND NEW.source_metadata = OLD.source_metadata AND NEW.supersedes_id IS NULL
     AND OLD.supersedes_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM victoria_conversational_memories p
        WHERE p.user_id = OLD.user_id AND p.id = OLD.supersedes_id AND p.source_type = 'plaid_transaction_profile'
     ) THEN RETURN NEW;
  END IF;
  RAISE EXCEPTION 'conversational memories are append-only outside Plaid profile erasure';
END;
$$;

CREATE OR REPLACE FUNCTION victoria_erase_plaid_profile_memories(p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN RAISE EXCEPTION 'A user ID is required'; END IF;
  PERFORM set_config('victoria.plaid_profile_erasure_user', p_user_id, true);
  -- Keep user statements/corrections and make corrections independent of the removed source fact.
  UPDATE public.victoria_conversational_memories child SET supersedes_id = NULL
   WHERE child.user_id = p_user_id AND child.source_type <> 'plaid_transaction_profile'
     AND child.supersedes_id IN (SELECT p.id FROM public.victoria_conversational_memories p
       WHERE p.user_id = p_user_id AND p.source_type = 'plaid_transaction_profile');
  DELETE FROM public.victoria_memory_embeddings e WHERE e.user_id = p_user_id
    AND EXISTS (SELECT 1 FROM public.victoria_conversational_memories m
      WHERE m.user_id = e.user_id AND m.id = e.memory_id AND m.source_type = 'plaid_transaction_profile');
  DELETE FROM public.victoria_conversational_memories
   WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile';
  PERFORM set_config('victoria.plaid_profile_erasure_user', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION victoria_erase_plaid_consent_history(p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN RAISE EXCEPTION 'A user ID is required'; END IF;
  PERFORM set_config('victoria.consent_erasure_user', p_user_id, true);
  DELETE FROM public.victoria_plaid_consent_events WHERE user_id = p_user_id;
  PERFORM set_config('victoria.consent_erasure_user', '', true);
END;
$$;

REVOKE ALL ON FUNCTION victoria_erase_plaid_profile_memories(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION victoria_erase_plaid_consent_history(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION victoria_erase_plaid_profile_memories(text) TO service_role;
GRANT EXECUTE ON FUNCTION victoria_erase_plaid_consent_history(text) TO service_role;
