-- Plaid Item credentials are encrypted by the application before persistence.
CREATE TABLE IF NOT EXISTS victoria_plaid_items (
  user_id text NOT NULL,
  item_id text NOT NULL,
  access_token_ciphertext text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_auth_tag text NOT NULL,
  encryption_key_version text NOT NULL,
  sync_cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id),
  UNIQUE (item_id),
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(item_id)) > 0)
);

CREATE TABLE IF NOT EXISTS victoria_plaid_transactions (
  user_id text NOT NULL,
  item_id text NOT NULL,
  transaction_id text NOT NULL,
  amount_cents bigint NOT NULL,
  currency_code text,
  transaction_date date NOT NULL,
  merchant_name text,
  category text,
  pending boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id, transaction_id),
  FOREIGN KEY (user_id, item_id) REFERENCES victoria_plaid_items(user_id, item_id) ON DELETE CASCADE,
  CHECK (length(trim(user_id)) > 0),
  CHECK (length(trim(transaction_id)) > 0),
  CHECK (currency_code IS NULL OR length(currency_code) = 3)
);
CREATE INDEX IF NOT EXISTS victoria_plaid_transactions_recent_idx
  ON victoria_plaid_transactions(user_id, transaction_date DESC);

ALTER TABLE victoria_plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE victoria_plaid_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY victoria_plaid_items_owner_policy ON victoria_plaid_items
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));
CREATE POLICY victoria_plaid_transactions_owner_policy ON victoria_plaid_transactions
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()::text))
  WITH CHECK (user_id = (SELECT auth.uid()::text));
-- Token envelopes are server-only, including encrypted values and IV/auth tags.
REVOKE ALL ON victoria_plaid_items FROM authenticated;
GRANT SELECT ON victoria_plaid_transactions TO authenticated;
GRANT ALL ON victoria_plaid_items, victoria_plaid_transactions TO service_role;
