-- Authoritative, immutable source events scoped to one authenticated user and conversation.
CREATE TABLE IF NOT EXISTS victoria_local_savings_events (
  event_id text NOT NULL,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type = 'avoided_spend'),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 500),
  merchant_name text,
  user_provided_amount_cents bigint,
  classification_confidence double precision NOT NULL CHECK (classification_confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id, event_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (length(trim(event_id)) > 0),
  CHECK (merchant_name IS NULL OR length(trim(merchant_name)) BETWEEN 1 AND 120),
  CHECK (user_provided_amount_cents IS NULL OR
    (user_provided_amount_cents > 0 AND user_provided_amount_cents <= 9007199254740991))
);

CREATE INDEX IF NOT EXISTS victoria_local_savings_events_conversation_created_idx
  ON victoria_local_savings_events (user_id, conversation_id, created_at, event_id);

DROP TRIGGER IF EXISTS victoria_local_savings_events_immutable ON victoria_local_savings_events;
CREATE TRIGGER victoria_local_savings_events_immutable
  BEFORE UPDATE OR DELETE ON victoria_local_savings_events
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_local_savings_history_mutation();

ALTER TABLE victoria_local_savings_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS victoria_local_savings_events_owner_policy ON victoria_local_savings_events;
CREATE POLICY victoria_local_savings_events_owner_policy ON victoria_local_savings_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()::text));
REVOKE ALL ON victoria_local_savings_events FROM PUBLIC, anon;
GRANT SELECT ON victoria_local_savings_events TO authenticated;
GRANT ALL ON victoria_local_savings_events TO service_role;
