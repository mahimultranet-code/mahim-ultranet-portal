-- Router-initiated, authenticated job channel. No inbound RouterOS management port is required.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS routers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  router_key TEXT NOT NULL UNIQUE,
  router_name TEXT NOT NULL,
  routeros_version TEXT,
  token_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS router_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  router_id INTEGER NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('activate_hotspot', 'activate_pppoe', 'extend_access', 'disable_access', 'emergency_activate', 'emergency_expire')),
  payload_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'applied', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (router_id) REFERENCES routers(id)
);

CREATE INDEX IF NOT EXISTS idx_router_jobs_poll
ON router_jobs(router_id, status, id);

CREATE TABLE IF NOT EXISTS router_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  router_id INTEGER NOT NULL,
  job_id INTEGER,
  event_type TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (router_id) REFERENCES routers(id),
  FOREIGN KEY (job_id) REFERENCES router_jobs(id)
);
