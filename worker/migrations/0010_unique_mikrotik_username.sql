-- Keep each RouterOS login mapped to at most one portal customer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_mikrotik_username_unique
ON customers(mikrotik_username)
WHERE mikrotik_username IS NOT NULL AND mikrotik_username <> '';
