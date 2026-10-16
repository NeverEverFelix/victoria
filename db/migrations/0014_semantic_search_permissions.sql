-- Functions are executable by PUBLIC by default. Resolve the search routine
-- through pg_proc instead of assuming pgvector lives in the extensions schema.
DO $$
DECLARE
  search_function regprocedure;
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

  SELECT p.oid::regprocedure INTO search_function
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_type vector_type ON vector_type.oid = p.proargtypes[1]
  WHERE n.nspname = 'public'
    AND p.proname = 'victoria_search_conversational_memories'
    AND p.pronargs = 4
    AND p.proargtypes[0] = 'text'::regtype
    AND vector_type.typname = 'vector'
    AND p.proargtypes[2] = 'text'::regtype
    AND p.proargtypes[3] = 'integer'::regtype;

  IF search_function IS NOT NULL THEN
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', search_function);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM anon', search_function);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM authenticated', search_function);
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', search_function);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM service_role', search_function);
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', search_function);
    END IF;
  END IF;
END;
$$;
