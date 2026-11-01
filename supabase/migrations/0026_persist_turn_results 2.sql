ALTER TABLE victoria_turns
  ADD COLUMN IF NOT EXISTS result_payload jsonb;
