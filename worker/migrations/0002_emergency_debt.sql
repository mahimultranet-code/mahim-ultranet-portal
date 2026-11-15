-- Mahim UltraNet emergency internet debt accounting
-- Apply this migration to the existing mahim-ultranet-db before deploying the updated Worker.
-- An emergency request is charged only after an administrator approves it.
-- A customer may have one outstanding debt balance; the next approved recharge pays it first.

CREATE TABLE IF NOT EXISTS emergency_debts (
  customer_id INTEGER PRIMARY KEY,
  amount_due_taka INTEGER NOT NULL DEFAULT 0 CHECK (amount_due_taka >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS emergency_debt_transactions (
  payment_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  amount_taka INTEGER NOT NULL CHECK (amount_taka > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payment_requests(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_customer_status
ON emergency_requests(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_requests_customer_status
ON payment_requests(customer_id, status);

-- Carry forward the new fee for any legacy pending requests created before this migration.
UPDATE emergency_requests SET fee_taka = 20 WHERE status = 'pending';
