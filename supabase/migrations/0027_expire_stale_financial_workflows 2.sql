-- Expiration closes actionability while preserving immutable proposal history.
ALTER TABLE victoria_local_savings_proposal_transitions
  DROP CONSTRAINT IF EXISTS victoria_local_savings_proposal_transitions_to_status_check;
ALTER TABLE victoria_local_savings_proposal_transitions
  ADD CONSTRAINT victoria_local_savings_proposal_transitions_to_status_check
  CHECK (to_status IN ('declined', 'recorded', 'superseded', 'expired'));

ALTER TABLE victoria_local_goal_allocation_transitions
  DROP CONSTRAINT IF EXISTS victoria_local_goal_allocation_transitions_status_check;
ALTER TABLE victoria_local_goal_allocation_transitions
  ADD CONSTRAINT victoria_local_goal_allocation_transitions_status_check
  CHECK (status IN ('recorded', 'declined', 'superseded', 'expired'));

ALTER TABLE victoria_local_entry_correction_transitions
  DROP CONSTRAINT IF EXISTS victoria_local_entry_correction_transitions_status_check;
ALTER TABLE victoria_local_entry_correction_transitions
  ADD CONSTRAINT victoria_local_entry_correction_transitions_status_check
  CHECK (status IN ('recorded', 'declined', 'superseded', 'expired'));
