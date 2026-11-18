-- Record explicit administrator confirmation that RouterOS activation succeeded.
-- Emergency debt is created only after this confirmation, never on approval alone.
CREATE TABLE IF NOT EXISTS emergency_activation_confirmations (
  request_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  confirmed_by INTEGER NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES emergency_requests(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (confirmed_by) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_emergency_activation_customer
ON emergency_activation_confirmations(customer_id, confirmed_at DESC);
