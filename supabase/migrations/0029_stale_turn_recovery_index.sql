CREATE INDEX IF NOT EXISTS victoria_turns_running_updated_idx
  ON victoria_turns (updated_at, id)
  WHERE status = 'running';
