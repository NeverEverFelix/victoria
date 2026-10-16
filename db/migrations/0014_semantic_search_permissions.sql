-- Functions are executable by PUBLIC by default. Restrict semantic retrieval to
-- the authenticated API role and the server-side service role when pgvector
-- and the search function are present. Avoid changing unrelated extension
-- privileges for PUBLIC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'extensions') THEN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE USAGE ON SCHEMA extensions FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT USAGE ON SCHEMA extensions TO authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE 'GRANT USAGE ON SCHEMA extensions TO service_role';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'extensions')
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'extensions' AND t.typname = 'vector')
     AND pg_catalog.to_regprocedure('public.victoria_search_conversational_memories(text, extensions.vector, text, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) FROM authenticated';
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) TO authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) FROM service_role';
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer) TO service_role';
    END IF;
  END IF;
END;
$$;
