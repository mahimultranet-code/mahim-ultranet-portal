-- Track the administrator approval and router-confirmed 5-hour emergency session.
ALTER TABLE emergency_requests ADD COLUMN approved_by INTEGER REFERENCES customers(id);
ALTER TABLE emergency_requests ADD COLUMN router_id INTEGER REFERENCES routers(id);
ALTER TABLE emergency_requests ADD COLUMN expires_at TEXT;
ALTER TABLE emergency_requests ADD COLUMN access_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (access_status IN ('pending', 'active', 'expiring', 'expired', 'failed'));

CREATE INDEX IF NOT EXISTS idx_emergency_access_expiry
ON emergency_requests(status, access_status, expires_at, router_id);
