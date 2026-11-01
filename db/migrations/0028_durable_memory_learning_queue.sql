-- Queue contextual memory extraction by durable turn identity. Conversation text
-- remains in victoria_turns and is read only after the turn has completed.
CREATE UNIQUE INDEX IF NOT EXISTS victoria_turns_identity_scope_idx
  ON victoria_turns (id, user_id, conversation_id);

CREATE TABLE IF NOT EXISTS victoria_memory_learning_jobs (
  turn_id text PRIMARY KEY,
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  lease_token text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT victoria_memory_learning_jobs_identity_fk
    FOREIGN KEY (turn_id, user_id, conversation_id)
    REFERENCES victoria_turns(id, user_id, conversation_id) ON DELETE CASCADE,
  CONSTRAINT victoria_memory_learning_jobs_lease_check
    CHECK ((status = 'processing') = (lease_expires_at IS NOT NULL AND lease_token IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS victoria_memory_learning_jobs_claim_idx
  ON victoria_memory_learning_jobs (available_at, created_at)
  WHERE status IN ('queued', 'processing');

ALTER TABLE victoria_memory_learning_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE victoria_memory_learning_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE victoria_memory_learning_jobs FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE victoria_memory_learning_jobs TO service_role;
