-- Keep revocation queue identity aligned with every user-scoped read/write,
-- even though Plaid Item IDs are currently globally unique in the active table.
ALTER TABLE victoria_plaid_revocation_queue
  DROP CONSTRAINT IF EXISTS victoria_plaid_revocation_queue_pkey;
ALTER TABLE victoria_plaid_revocation_queue
  ADD CONSTRAINT victoria_plaid_revocation_queue_pkey PRIMARY KEY (user_id, item_id);
