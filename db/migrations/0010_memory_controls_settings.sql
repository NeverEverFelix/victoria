CREATE TABLE IF NOT EXISTS public.victoria_memory_settings (
  user_id text PRIMARY KEY,
  memory_paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.victoria_memory_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_memory_settings_user_select ON public.victoria_memory_settings;
CREATE POLICY victoria_memory_settings_user_select ON public.victoria_memory_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
REVOKE ALL ON public.victoria_memory_settings FROM anon, authenticated;
GRANT ALL ON public.victoria_memory_settings TO service_role;

CREATE OR REPLACE FUNCTION public.victoria_forget_all_conversational_memories(p_user_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE deleted_count integer;
BEGIN
  IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN RETURN 0; END IF;
  PERFORM set_config('app.user_memory_forget_user', p_user_id, true);
  DELETE FROM public.victoria_memory_embeddings e
  WHERE e.user_id = p_user_id AND EXISTS (
    SELECT 1 FROM public.victoria_conversational_memories m
    WHERE m.user_id = p_user_id AND m.id = e.memory_id
      AND m.source_type <> 'plaid_transaction_profile'
  );
  DELETE FROM public.victoria_conversational_memories m
  WHERE m.user_id = p_user_id AND m.source_type <> 'plaid_transaction_profile';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.victoria_forget_all_conversational_memories(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.victoria_forget_all_conversational_memories(text) TO service_role;
