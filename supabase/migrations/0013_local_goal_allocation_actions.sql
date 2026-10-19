-- Local pending goal-allocation approvals survive restarts as immutable snapshots.
CREATE TABLE IF NOT EXISTS victoria_local_goal_allocation_proposals (
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
  CHECK (decision #>> '{action}' = 'update_goal'),
  CHECK (decision #>> '{goalAllocation,status}' = 'pending'),
  CHECK (decision #>> '{goalAllocation,id}' = proposal_id),
  CHECK (decision #>> '{goalAllocation,userId}' = user_id),
  CHECK (decision #>> '{toolCall,name}' = 'createSavingsGoalAllocation'),
  CHECK (decision #>> '{toolCall,actionId}' = action_id),
  CHECK (decision #>> '{toolCall,requiresApproval}' = 'true')
);

CREATE TABLE IF NOT EXISTS victoria_local_goal_allocation_action_approvals (
  approval_id text PRIMARY KEY,
  user_id text NOT NULL,
  action_id text NOT NULL,
  approval jsonb NOT NULL CHECK (jsonb_typeof(approval) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, action_id) REFERENCES victoria_local_goal_allocation_proposals(user_id, action_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(action_id)) > 0),
  CHECK (approval->>'actionId' = action_id),
  CHECK (approval->>'id' = approval_id),
  CHECK (approval->>'source' = 'user_message')
);

CREATE TABLE IF NOT EXISTS victoria_local_goal_allocation_transitions (
  transition_id text PRIMARY KEY,
  proposal_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  action_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('recorded', 'declined', 'superseded')),
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, proposal_id),
  UNIQUE (user_id, action_id),
  FOREIGN KEY (user_id, proposal_id) REFERENCES victoria_local_goal_allocation_proposals(user_id, proposal_id),
  CHECK (length(trim(conversation_id)) > 0)
);

CREATE OR REPLACE FUNCTION victoria_reject_local_goal_allocation_action_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'local goal allocation action history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS victoria_local_goal_allocation_proposals_immutable ON victoria_local_goal_allocation_proposals;
CREATE TRIGGER victoria_local_goal_allocation_proposals_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_goal_allocation_proposals
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_goal_allocation_action_mutation();

DROP TRIGGER IF EXISTS victoria_local_goal_allocation_approvals_immutable ON victoria_local_goal_allocation_action_approvals;
CREATE TRIGGER victoria_local_goal_allocation_approvals_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_goal_allocation_action_approvals
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_goal_allocation_action_mutation();

DROP TRIGGER IF EXISTS victoria_local_goal_allocation_transitions_immutable ON victoria_local_goal_allocation_transitions;
CREATE TRIGGER victoria_local_goal_allocation_transitions_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_goal_allocation_transitions
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_goal_allocation_action_mutation();

ALTER TABLE victoria_local_goal_allocation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_local_goal_allocation_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_local_goal_allocation_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS victoria_local_goal_alloc_proposals_owner_policy ON victoria_local_goal_allocation_proposals;
CREATE POLICY victoria_local_goal_alloc_proposals_owner_policy ON victoria_local_goal_allocation_proposals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS victoria_local_goal_alloc_approvals_owner_policy ON victoria_local_goal_allocation_action_approvals;
CREATE POLICY victoria_local_goal_alloc_approvals_owner_policy ON victoria_local_goal_allocation_action_approvals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
DROP POLICY IF EXISTS victoria_local_goal_alloc_transitions_owner_policy ON victoria_local_goal_allocation_transitions;
CREATE POLICY victoria_local_goal_alloc_transitions_owner_policy ON victoria_local_goal_allocation_transitions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

GRANT SELECT ON victoria_local_goal_allocation_proposals, victoria_local_goal_allocation_action_approvals,
  victoria_local_goal_allocation_transitions TO authenticated;
GRANT ALL ON victoria_local_goal_allocation_proposals, victoria_local_goal_allocation_action_approvals,
  victoria_local_goal_allocation_transitions TO service_role;
