-- Persist the fact that a pending savings proposal is awaiting an unambiguous revision amount.
-- This is an append-only workflow fact linked to the immutable proposal/action identity.
CREATE TABLE IF NOT EXISTS victoria_local_savings_revision_clarifications (
  clarification_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  proposal_id text NOT NULL,
  action_id text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, clarification_id),
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, proposal_id)
    REFERENCES victoria_local_savings_proposals(user_id, proposal_id),
  FOREIGN KEY (user_id, action_id)
    REFERENCES victoria_local_savings_proposals(user_id, action_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (length(trim(proposal_id)) > 0),
  CHECK (length(trim(action_id)) > 0)
);

DROP TRIGGER IF EXISTS victoria_local_savings_revision_clarifications_immutable
  ON victoria_local_savings_revision_clarifications;
CREATE TRIGGER victoria_local_savings_revision_clarifications_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_revision_clarifications
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_revision_clarifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_savings_revision_clarifications_owner_policy
  ON victoria_local_savings_revision_clarifications;
CREATE POLICY victoria_local_savings_revision_clarifications_owner_policy
  ON victoria_local_savings_revision_clarifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
REVOKE ALL ON victoria_local_savings_revision_clarifications FROM PUBLIC, anon;
GRANT SELECT ON victoria_local_savings_revision_clarifications TO authenticated;
GRANT ALL ON victoria_local_savings_revision_clarifications TO service_role;
