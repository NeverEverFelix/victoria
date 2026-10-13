CREATE TABLE IF NOT EXISTS victoria_plaid_consent_events (
  sequence_id bigserial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  user_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('granted', 'revoked')),
  products text[] NOT NULL CHECK (
    cardinality(products) > 0 AND
    array_position(products, NULL) IS NULL AND
    products <@ ARRAY['assets', 'auth', 'employment', 'identity', 'income_verification', 'investments', 'liabilities', 'transactions']::text[]
  ),
  purpose text NOT NULL CHECK (purpose = 'financial_profile'),
  happened_at timestamptz NOT NULL,
  previous_event_id text,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT victoria_plaid_consent_event_user_id_unique UNIQUE (user_id, event_id),
  CONSTRAINT victoria_plaid_consent_previous_event_fk
    FOREIGN KEY (user_id, previous_event_id)
    REFERENCES victoria_plaid_consent_events (user_id, event_id),
  CONSTRAINT victoria_plaid_consent_event_shape CHECK (
    (event_type = 'granted' AND revoked_at IS NULL AND granted_at = happened_at) OR
    (event_type = 'revoked' AND revoked_at IS NOT NULL AND revoked_at = happened_at AND previous_event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS victoria_plaid_consent_one_root_per_user_idx
  ON victoria_plaid_consent_events (user_id)
  WHERE previous_event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS victoria_plaid_consent_one_successor_idx
  ON victoria_plaid_consent_events (user_id, previous_event_id)
  WHERE previous_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS victoria_plaid_consent_latest_by_user_idx
  ON victoria_plaid_consent_events (user_id, sequence_id DESC);

CREATE OR REPLACE FUNCTION victoria_reject_plaid_consent_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Plaid consent events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER victoria_plaid_consent_events_append_only
  BEFORE UPDATE OR DELETE ON victoria_plaid_consent_events
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_plaid_consent_event_mutation();
