-- The original event key must include conversation scope. This also repairs
-- databases where an earlier 0024 definition was already recorded as applied.
ALTER TABLE victoria_local_savings_events
  DROP CONSTRAINT IF EXISTS victoria_local_savings_events_pkey;

ALTER TABLE victoria_local_savings_events
  ADD CONSTRAINT victoria_local_savings_events_pkey
  PRIMARY KEY (user_id, conversation_id, event_id);
