-- Structured user-scoped goals created only after an explicit confirmation.
CREATE TABLE IF NOT EXISTS victoria_savings_goals (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  target_amount_cents bigint CHECK (target_amount_cents IS NULL OR target_amount_cents > 0),
  saved_amount_cents bigint NOT NULL DEFAULT 0 CHECK (saved_amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  approved_action_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, approved_action_id),
  UNIQUE (user_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS victoria_savings_goals_user_name_ci_idx
  ON victoria_savings_goals (user_id, lower(name));

ALTER TABLE victoria_savings_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_savings_goals_owner_policy ON victoria_savings_goals;
CREATE POLICY victoria_savings_goals_owner_policy ON victoria_savings_goals
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));
GRANT SELECT ON victoria_savings_goals TO authenticated;
