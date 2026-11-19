-- Encrypted first-time Hotspot credentials; ciphertext is deleted after RouterOS ACK.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotspot_provisioning (
  customer_id INTEGER PRIMARY KEY,
  mikrotik_username TEXT NOT NULL UNIQUE,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'active', 'failed')),
  router_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (router_id) REFERENCES routers(id)
);
CREATE INDEX IF NOT EXISTS idx_hotspot_provisioning_status ON hotspot_provisioning(status, customer_id);
