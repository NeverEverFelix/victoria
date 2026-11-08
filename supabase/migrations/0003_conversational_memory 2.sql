CREATE TABLE IF NOT EXISTS victoria_memory_decisions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (length(trim(user_id)) > 0),
  CHECK (jsonb_typeof(decision) = 'object')
);

CREATE INDEX IF NOT EXISTS victoria_memory_decisions_user_created_idx
  ON victoria_memory_decisions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS victoria_conversation_context (
  user_id text NOT NULL,
  conversation_id text NOT NULL,
  messages jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, conversation_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(conversation_id)) > 0),
  CHECK (jsonb_typeof(messages) = 'array'),
  CHECK (jsonb_array_length(messages) <= 20)
);

CREATE TABLE IF NOT EXISTS victoria_conversational_memories (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('preference', 'goal', 'habit', 'other')),
  memory_key text NOT NULL,
  value text NOT NULL,
  evidence text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id text,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, supersedes_id) REFERENCES victoria_conversational_memories(user_id, id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(memory_key)) > 0),
  CHECK (length(trim(value)) > 0),
  CHECK (length(trim(evidence)) > 0)
);

CREATE INDEX IF NOT EXISTS victoria_conversational_memories_user_created_idx
  ON victoria_conversational_memories (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION victoria_reject_conversational_memory_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversational memory decisions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS victoria_memory_decisions_immutable ON victoria_memory_decisions;
CREATE TRIGGER victoria_memory_decisions_immutable
  BEFORE UPDATE OR DELETE ON victoria_memory_decisions
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_conversational_memory_mutation();

DROP TRIGGER IF EXISTS victoria_conversational_memories_immutable ON victoria_conversational_memories;
CREATE TRIGGER victoria_conversational_memories_immutable
  BEFORE UPDATE OR DELETE ON victoria_conversational_memories
  FOR EACH ROW EXECUTE FUNCTION victoria_reject_conversational_memory_mutation();
