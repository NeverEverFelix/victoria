-- Local persistent corrections append signed adjustments without mutating saved entries.
CREATE TABLE IF NOT EXISTS victoria_local_savings_entry_corrections (
  correction_id text PRIMARY KEY,
  user_id text NOT NULL,
  savings_entry_id text NOT NULL REFERENCES victoria_local_savings_entries(entry_id),
  prior_amount_cents bigint NOT NULL CHECK (prior_amount_cents > 0 AND prior_amount_cents <= 9007199254740991),
  corrected_amount_cents bigint NOT NULL CHECK (corrected_amount_cents > 0 AND corrected_amount_cents <= 9007199254740991),
  adjustment_cents bigint NOT NULL CHECK (adjustment_cents <> 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  approval_id text NOT NULL,
  approved_action_id text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, approved_action_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(approval_id)) > 0),
  CHECK (length(trim(approved_action_id)) > 0),
  CHECK (prior_amount_cents + adjustment_cents = corrected_amount_cents)
);

CREATE INDEX IF NOT EXISTS victoria_local_entry_corrections_user_entry_idx
  ON victoria_local_savings_entry_corrections (user_id, savings_entry_id, created_at);

DROP TRIGGER IF EXISTS victoria_local_entry_corrections_immutable ON victoria_local_savings_entry_corrections;
CREATE TRIGGER victoria_local_entry_corrections_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_entry_corrections
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_entry_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_entry_corrections_owner_policy ON victoria_local_savings_entry_corrections;
CREATE POLICY victoria_local_entry_corrections_owner_policy ON victoria_local_savings_entry_corrections
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));

GRANT SELECT ON victoria_local_savings_entry_corrections TO authenticated;
GRANT ALL ON victoria_local_savings_entry_corrections TO service_role;
