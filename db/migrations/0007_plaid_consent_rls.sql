-- Supabase auth roles and auth.uid() are explicit prerequisites; fail clearly
-- instead of silently applying a weaker policy on plain PostgreSQL.
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') OR
     NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Migration 0007 requires Supabase auth.uid() and anon, authenticated, and service_role roles';
  END IF;
END;
$$;

-- Consent history is visible only to its owner. Mutations remain server-side
-- and append-only; the application uses the trusted privileged server role.
-- Migration 0002 defines user_id as text, hence the explicit UUID-to-text cast.
ALTER TABLE victoria_plaid_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS victoria_plaid_consent_owner_policy
  ON victoria_plaid_consent_events;
CREATE POLICY victoria_plaid_consent_owner_policy
  ON victoria_plaid_consent_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()::text));

REVOKE ALL ON victoria_plaid_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON victoria_plaid_consent_events TO authenticated;
GRANT ALL ON victoria_plaid_consent_events TO service_role;

-- RLS is intentionally not forced while the deployment pool role is unverified.
-- Confirm the server role has the required bypass behavior before live wiring.
