-- Local persistent chat stores only approved, mocked goal allocations.
CREATE TABLE IF NOT EXISTS victoria_local_savings_goal_allocations (
  allocation_id text PRIMARY KEY,
  user_id text NOT NULL,
  savings_entry_id text NOT NULL REFERENCES victoria_local_savings_entries(entry_id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  goal_name text NOT NULL CHECK (length(trim(goal_name)) > 0),
  approved_action_id text NOT NULL,
  approval_id text NOT NULL,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, approved_action_id),
  UNIQUE (user_id, savings_entry_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(approved_action_id)) > 0),
  CHECK (length(trim(approval_id)) > 0)
);

CREATE INDEX IF NOT EXISTS victoria_local_goal_allocations_user_created_idx
  ON victoria_local_savings_goal_allocations (user_id, created_at DESC);

DROP TRIGGER IF EXISTS victoria_local_goal_allocations_immutable ON victoria_local_savings_goal_allocations;
CREATE TRIGGER victoria_local_goal_allocations_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_goal_allocations
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_goal_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_goal_allocations_owner_policy ON victoria_local_savings_goal_allocations;
CREATE POLICY victoria_local_goal_allocations_owner_policy ON victoria_local_savings_goal_allocations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

GRANT SELECT ON victoria_local_savings_goal_allocations TO authenticated;
GRANT ALL ON victoria_local_savings_goal_allocations TO service_role;
