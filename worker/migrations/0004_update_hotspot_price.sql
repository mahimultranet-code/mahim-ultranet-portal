-- Update legacy five-hour hotspot package pricing from Tk 6 to Tk 20.
-- Scope is limited to the 300-minute hotspot package; PPPoE and other durations are untouched.
UPDATE packages
SET price_taka = 20,
    duration = '৫ ঘণ্টা'
WHERE service_type = 'hotspot'
  AND duration_minutes = 300
  AND price_taka = 6;
