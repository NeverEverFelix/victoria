-- Consent history is visible only to its owner. Mutations remain server-side
-- and append-only; the application uses the privileged server repository.
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
