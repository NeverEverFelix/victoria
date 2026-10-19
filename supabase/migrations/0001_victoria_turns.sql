CREATE TABLE IF NOT EXISTS victoria_turns (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  idempotency_key text NOT NULL,
  user_message text NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempt integer NOT NULL CHECK (attempt >= 0),
  revision integer NOT NULL CHECK (revision >= 0),
  accepted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  result_id text,
  failure_code text,
  CONSTRAINT victoria_turns_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT victoria_turns_completion_shape CHECK (
    (status = 'completed' AND result_id IS NOT NULL) OR
    (status <> 'completed' AND result_id IS NULL)
  ),
  CONSTRAINT victoria_turns_failure_shape CHECK (
    (status = 'failed' AND failure_code IS NOT NULL) OR
    (status <> 'failed' AND failure_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS victoria_turns_conversation_status_idx
  ON victoria_turns (user_id, conversation_id, status, accepted_at);
