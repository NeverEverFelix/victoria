-- Tighten same-user links and safe-integer bounds across durable local savings records.
ALTER TABLE victoria_local_savings_entries
  ADD CONSTRAINT victoria_local_savings_entries_safe_cents
    CHECK (amount_cents <= 9007199254740991) NOT VALID;
ALTER TABLE victoria_local_savings_entries
  VALIDATE CONSTRAINT victoria_local_savings_entries_safe_cents;
ALTER TABLE victoria_local_savings_entries
  ADD CONSTRAINT victoria_local_savings_entries_user_entry_unique UNIQUE (user_id, entry_id);

ALTER TABLE victoria_local_savings_goal_allocations
  ADD CONSTRAINT victoria_local_goal_allocations_safe_cents
    CHECK (amount_cents <= 9007199254740991) NOT VALID;
ALTER TABLE victoria_local_savings_goal_allocations
  VALIDATE CONSTRAINT victoria_local_goal_allocations_safe_cents;
ALTER TABLE victoria_local_savings_goal_allocations
  DROP CONSTRAINT victoria_local_savings_goal_allocations_savings_entry_id_fkey;
ALTER TABLE victoria_local_savings_goal_allocations
  ADD CONSTRAINT victoria_local_goal_allocations_user_entry_fkey
    FOREIGN KEY (user_id, savings_entry_id)
    REFERENCES victoria_local_savings_entries(user_id, entry_id);

ALTER TABLE victoria_local_savings_entry_corrections
  DROP CONSTRAINT victoria_local_savings_entry_corrections_savings_entry_id_fkey;
ALTER TABLE victoria_local_savings_entry_corrections
  ADD CONSTRAINT victoria_local_entry_corrections_user_entry_fkey
    FOREIGN KEY (user_id, savings_entry_id)
    REFERENCES victoria_local_savings_entries(user_id, entry_id);

ALTER TABLE victoria_local_goal_allocation_action_approvals
  ADD CONSTRAINT victoria_local_goal_approvals_user_action_approval_unique
    UNIQUE (user_id, action_id, approval_id);
ALTER TABLE victoria_local_savings_goal_allocations
  ADD CONSTRAINT victoria_local_goal_allocations_approval_fkey
    FOREIGN KEY (user_id, approved_action_id, approval_id)
    REFERENCES victoria_local_goal_allocation_action_approvals(user_id, action_id, approval_id);

-- The ledger row and its recorded transition are written in one transaction.
-- A deferred check allows either insertion order while requiring an exact approval snapshot at commit.
CREATE OR REPLACE FUNCTION victoria_require_local_savings_entry_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM victoria_local_savings_proposal_transitions t
    WHERE t.user_id = NEW.user_id
      AND t.proposal_id = NEW.proposal_id
      AND t.action_id = NEW.approved_action_id
      AND t.to_status = 'recorded'
      AND t.snapshot #>> '{transition,approvalId}' = NEW.approval_id
      AND t.snapshot #>> '{transition,actionId}' = NEW.approved_action_id
      AND t.snapshot #>> '{transition,ledgerEntryId}' = NEW.entry_id
  ) THEN
    RAISE EXCEPTION 'local savings entry requires its exact recorded approval transition';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS victoria_local_savings_entry_requires_approval ON victoria_local_savings_entries;
CREATE CONSTRAINT TRIGGER victoria_local_savings_entry_requires_approval
  AFTER INSERT ON victoria_local_savings_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION victoria_require_local_savings_entry_approval();
