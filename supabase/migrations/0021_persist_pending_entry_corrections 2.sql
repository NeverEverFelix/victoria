-- Pending correction requests and terminal outcomes survive worker restarts.
CREATE TABLE IF NOT EXISTS victoria_local_entry_correction_proposals (
  proposal_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  action_id text NOT NULL,
  savings_entry_id text NOT NULL,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, proposal_id),
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, savings_entry_id) REFERENCES victoria_local_savings_entries(user_id, entry_id),
  CHECK (length(trim(user_id)) > 0 AND length(trim(conversation_id)) > 0 AND length(trim(action_id)) > 0),
  CHECK (jsonb_typeof(decision) = 'object'),
  CHECK (decision->>'action' = 'correct_ledger_entry'),
  CHECK (decision #>> '{entryCorrection,status}' = 'pending'),
  CHECK (decision #>> '{entryCorrection,id}' = proposal_id),
  CHECK (decision #>> '{entryCorrection,userId}' = user_id),
  CHECK (decision #>> '{toolCall,name}' = 'createSavingsEntryCorrection'),
  CHECK (decision #>> '{toolCall,actionId}' = action_id),
  CHECK (decision #>> '{toolCall,requiresApproval}' = 'true')
);

CREATE TABLE IF NOT EXISTS victoria_local_entry_correction_transitions (
  transition_id text PRIMARY KEY,
  proposal_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  action_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('recorded', 'declined', 'superseded')),
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, proposal_id),
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, proposal_id) REFERENCES victoria_local_entry_correction_proposals(user_id, proposal_id),
  CHECK (length(trim(conversation_id)) > 0)
);

CREATE OR REPLACE FUNCTION victoria_reject_local_entry_correction_state_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'local entry correction state is append-only';
END;
$$;

DROP TRIGGER IF EXISTS victoria_local_entry_correction_proposals_immutable ON victoria_local_entry_correction_proposals;
CREATE TRIGGER victoria_local_entry_correction_proposals_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_entry_correction_proposals
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_entry_correction_state_mutation();
DROP TRIGGER IF EXISTS victoria_local_entry_correction_transitions_immutable ON victoria_local_entry_correction_transitions;
CREATE TRIGGER victoria_local_entry_correction_transitions_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_entry_correction_transitions
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_entry_correction_state_mutation();

ALTER TABLE victoria_local_entry_correction_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_local_entry_correction_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_entry_correction_proposals_owner_policy ON victoria_local_entry_correction_proposals;
CREATE POLICY victoria_local_entry_correction_proposals_owner_policy ON victoria_local_entry_correction_proposals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS victoria_local_entry_correction_transitions_owner_policy ON victoria_local_entry_correction_transitions;
CREATE POLICY victoria_local_entry_correction_transitions_owner_policy ON victoria_local_entry_correction_transitions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
REVOKE ALL ON victoria_local_entry_correction_proposals, victoria_local_entry_correction_transitions FROM PUBLIC, anon;
GRANT SELECT ON victoria_local_entry_correction_proposals, victoria_local_entry_correction_transitions TO authenticated;
GRANT ALL ON victoria_local_entry_correction_proposals, victoria_local_entry_correction_transitions TO service_role;
