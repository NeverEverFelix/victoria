-- Short-lived continuation state for local avoided-spend amount questions.
CREATE TABLE IF NOT EXISTS victoria_pending_amount_clarifications (
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  classification jsonb NOT NULL,
  savings_event jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, conversation_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (jsonb_typeof(classification) = 'object'),
  CHECK (classification->>'type' = 'avoided_spend'),
  CHECK (jsonb_typeof(savings_event) = 'object'),
  CHECK (savings_event->>'type' = 'avoided_spend'),
  CHECK (savings_event->>'userId' = user_id),
  CHECK (expires_at > updated_at)
);

ALTER TABLE victoria_pending_amount_clarifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_pending_amount_clarifications_owner_policy
  ON victoria_pending_amount_clarifications;
CREATE POLICY victoria_pending_amount_clarifications_owner_policy
  ON victoria_pending_amount_clarifications
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));

GRANT SELECT, INSERT, UPDATE, DELETE ON victoria_pending_amount_clarifications TO authenticated;
GRANT ALL ON victoria_pending_amount_clarifications TO service_role;
