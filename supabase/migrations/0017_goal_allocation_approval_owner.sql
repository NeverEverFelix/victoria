-- Bind newly written goal-allocation approval snapshots to their owner.
-- NOT VALID preserves older append-only records while enforcing new rows.
ALTER TABLE victoria_local_goal_allocation_action_approvals
  ADD CONSTRAINT victoria_local_goal_approvals_user_matches_snapshot
    CHECK (approval->>'userId' = user_id) NOT VALID;
