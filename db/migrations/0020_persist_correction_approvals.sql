-- Persist the exact approved correction details and require a matching approval row.
CREATE TABLE IF NOT EXISTS victoria_local_savings_entry_correction_approvals (
  approval_id text NOT NULL,
  user_id text NOT NULL,
  approved_action_id text NOT NULL,
  savings_entry_id text NOT NULL,
  corrected_amount_cents bigint NOT NULL
    CHECK (corrected_amount_cents > 0 AND corrected_amount_cents <= 9007199254740991),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  approval jsonb NOT NULL CHECK (jsonb_typeof(approval) = 'object'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, approved_action_id),
  UNIQUE (user_id, approved_action_id, approval_id),
  FOREIGN KEY (user_id, savings_entry_id)
    REFERENCES victoria_local_savings_entries(user_id, entry_id),
  CHECK (approval->>'id' = approval_id),
  CHECK (approval->>'userId' = user_id),
  CHECK (approval->>'actionId' = approved_action_id),
  CHECK (approval->>'source' = 'user_message'),
  CHECK ((approval->>'savingsEntryId') = savings_entry_id),
  CHECK ((approval->>'correctedAmountCents')::bigint = corrected_amount_cents),
  CHECK (approval->>'reason' = reason)
);

CREATE INDEX IF NOT EXISTS victoria_local_correction_approvals_user_entry_idx
  ON victoria_local_savings_entry_correction_approvals(user_id, savings_entry_id, created_at DESC);

DROP TRIGGER IF EXISTS victoria_local_correction_approvals_immutable
  ON victoria_local_savings_entry_correction_approvals;
CREATE TRIGGER victoria_local_correction_approvals_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_entry_correction_approvals
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_entry_correction_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_correction_approvals_owner_policy
  ON victoria_local_savings_entry_correction_approvals;
CREATE POLICY victoria_local_correction_approvals_owner_policy
  ON victoria_local_savings_entry_correction_approvals
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

REVOKE ALL ON victoria_local_savings_entry_correction_approvals FROM PUBLIC, anon;
GRANT SELECT ON victoria_local_savings_entry_correction_approvals TO authenticated;
GRANT ALL ON victoria_local_savings_entry_correction_approvals TO service_role;

ALTER TABLE victoria_local_savings_entry_corrections
  ADD CONSTRAINT victoria_local_entry_corrections_exact_approval_fkey
    FOREIGN KEY (user_id, approved_action_id, approval_id)
    REFERENCES victoria_local_savings_entry_correction_approvals(user_id, approved_action_id, approval_id)
    NOT VALID;
