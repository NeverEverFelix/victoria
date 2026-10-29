-- Local persistent chat stores only mocked savings proposals and ledger entries.
CREATE TABLE IF NOT EXISTS victoria_local_savings_proposals (
  proposal_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  action_id text NOT NULL,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, proposal_id),
  UNIQUE (user_id, action_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (length(trim(action_id)) > 0),
  CHECK (jsonb_typeof(decision) = 'object'),
  CHECK (decision #>> '{proposal,status}' = 'pending'),
  CHECK (decision #>> '{proposal,id}' = proposal_id),
  CHECK (decision #>> '{proposal,userId}' = user_id),
  CHECK (decision #>> '{proposal,actionId}' = action_id),
  CHECK (decision #>> '{toolCall,name}' = 'createSavingsEntry'),
  CHECK (decision #>> '{toolCall,requiresApproval}' = 'true')
);

CREATE TABLE IF NOT EXISTS victoria_local_savings_proposal_transitions (
  transition_id text PRIMARY KEY,
  proposal_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  action_id text NOT NULL,
  from_status text NOT NULL CHECK (from_status = 'pending'),
  to_status text NOT NULL CHECK (to_status IN ('declined', 'recorded', 'superseded')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, proposal_id),
  FOREIGN KEY (user_id, proposal_id) REFERENCES victoria_local_savings_proposals(user_id, proposal_id),
  CHECK (length(trim(conversation_id)) > 0)
);

CREATE TABLE IF NOT EXISTS victoria_local_savings_entries (
  entry_id text PRIMARY KEY,
  user_id text NOT NULL,
  event_id text NOT NULL,
  proposal_id text NOT NULL,
  approval_id text NOT NULL,
  approved_action_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  goal_name text,
  movement_mode text NOT NULL CHECK (movement_mode = 'mock_ledger'),
  status text NOT NULL CHECK (status = 'completed'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approved_action_id),
  UNIQUE (user_id, proposal_id),
  FOREIGN KEY (user_id, proposal_id) REFERENCES victoria_local_savings_proposals(user_id, proposal_id),
  FOREIGN KEY (user_id, approved_action_id) REFERENCES victoria_local_savings_proposals(user_id, action_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(event_id)) > 0),
  CHECK (length(trim(approval_id)) > 0)
);

CREATE INDEX IF NOT EXISTS victoria_local_savings_entries_user_created_idx
  ON victoria_local_savings_entries (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION victoria_reject_local_savings_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'local savings history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS victoria_local_savings_proposals_immutable ON victoria_local_savings_proposals;
CREATE TRIGGER victoria_local_savings_proposals_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_proposals
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

DROP TRIGGER IF EXISTS victoria_local_savings_transitions_immutable ON victoria_local_savings_proposal_transitions;
CREATE TRIGGER victoria_local_savings_transitions_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_proposal_transitions
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

DROP TRIGGER IF EXISTS victoria_local_savings_entries_immutable ON victoria_local_savings_entries;
CREATE TRIGGER victoria_local_savings_entries_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_entries
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_local_savings_proposal_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_local_savings_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS victoria_local_savings_proposals_owner_policy ON victoria_local_savings_proposals;
CREATE POLICY victoria_local_savings_proposals_owner_policy ON victoria_local_savings_proposals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS victoria_local_savings_transitions_owner_policy ON victoria_local_savings_proposal_transitions;
CREATE POLICY victoria_local_savings_transitions_owner_policy ON victoria_local_savings_proposal_transitions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS victoria_local_savings_entries_owner_policy ON victoria_local_savings_entries;
CREATE POLICY victoria_local_savings_entries_owner_policy ON victoria_local_savings_entries
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

GRANT SELECT ON victoria_local_savings_proposals, victoria_local_savings_proposal_transitions,
  victoria_local_savings_entries TO authenticated;
GRANT ALL ON victoria_local_savings_proposals, victoria_local_savings_proposal_transitions,
  victoria_local_savings_entries TO service_role;
