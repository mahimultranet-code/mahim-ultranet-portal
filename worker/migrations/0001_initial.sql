-- Mahim UltraNet baseline schema for an isolated staging D1 database.
-- Apply this before 0002_emergency_debt.sql and 0003_seed_packages.sql.
-- All statements are idempotent so a fresh staging database can be initialized safely.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mikrotik_username TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
  email TEXT,
  firebase_uid TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  customer_id INTEGER PRIMARY KEY,
  balance_taka INTEGER NOT NULL DEFAULT 0 CHECK (balance_taka >= 0),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount_taka INTEGER NOT NULL CHECK (amount_taka > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_unique
ON wallet_transactions(reference) WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_customer_created
ON wallet_transactions(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_taka INTEGER NOT NULL CHECK (price_taka > 0),
  duration TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  speed_mbps INTEGER NOT NULL DEFAULT 5 CHECK (speed_mbps > 0),
  service_type TEXT NOT NULL DEFAULT 'hotspot' CHECK (service_type IN ('hotspot', 'pppoe'))
);

CREATE INDEX IF NOT EXISTS idx_packages_active_price
ON packages(is_active, price_taka);

CREATE TABLE IF NOT EXISTS customer_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  service_type TEXT NOT NULL,
  price_taka INTEGER NOT NULL CHECK (price_taka > 0),
  speed_mbps INTEGER NOT NULL CHECK (speed_mbps > 0),
  started_at TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (package_id) REFERENCES packages(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_packages_customer_created
ON customer_packages(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('bkash', 'nagad')),
  sender_mobile TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  amount_taka INTEGER NOT NULL CHECK (amount_taka > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_customer_status
ON payment_requests(customer_id, status);

CREATE TABLE IF NOT EXISTS emergency_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  fee_taka INTEGER NOT NULL DEFAULT 20 CHECK (fee_taka = 20),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  debt_paid INTEGER NOT NULL DEFAULT 0 CHECK (debt_paid IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_customer_status
ON emergency_requests(customer_id, status);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_reply TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_complaints_status_created
ON complaints(status, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_customer_status
ON password_reset_requests(customer_id, status);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_created
ON admin_logs(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_customer
ON sessions(customer_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
