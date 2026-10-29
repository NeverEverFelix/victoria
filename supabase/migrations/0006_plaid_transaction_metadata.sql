ALTER TABLE victoria_plaid_transactions
  ADD COLUMN IF NOT EXISTS detailed_category text,
  ADD COLUMN IF NOT EXISTS merchant_entity_id text,
  ADD COLUMN IF NOT EXISTS payment_channel text;

ALTER TABLE victoria_plaid_transactions
  ADD CONSTRAINT victoria_plaid_transaction_payment_channel_check
    CHECK (payment_channel IS NULL OR payment_channel IN ('in store', 'online', 'other'));
