-- Bind purchased service records to the router that accepted activation.
ALTER TABLE customer_packages ADD COLUMN router_id INTEGER REFERENCES routers(id);

CREATE INDEX IF NOT EXISTS idx_customer_packages_expiry
ON customer_packages(status, expires_at, router_id);
