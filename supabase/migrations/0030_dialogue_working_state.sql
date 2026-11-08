CREATE TABLE IF NOT EXISTS victoria_dialogue_working_state (
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, conversation_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (jsonb_typeof(state) = 'object'),
  CHECK (jsonb_typeof(state->'turns') = 'array'),
  CHECK (jsonb_array_length(state->'turns') <= 40),
  CHECK (expires_at > updated_at)
);

CREATE INDEX IF NOT EXISTS victoria_dialogue_working_state_expiry_idx
  ON victoria_dialogue_working_state (expires_at);

ALTER TABLE victoria_dialogue_working_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE victoria_dialogue_working_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE victoria_dialogue_working_state TO service_role;
