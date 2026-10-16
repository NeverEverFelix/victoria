-- Functions are executable by PUBLIC by default. Restrict semantic retrieval to
-- the authenticated API role and the server-side service role.
REVOKE USAGE ON SCHEMA extensions FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.victoria_search_conversational_memories(text, extensions.vector, text, integer)
  TO authenticated, service_role;
