-- Keep the emergency five-hour offer out of the ordinary package catalogue.
-- Existing customer order history remains intact; only the package is disabled.
UPDATE packages
SET is_active = 0
WHERE service_type = 'hotspot'
  AND duration_minutes = 300
  AND duration = '৫ ঘণ্টা'
  AND price_taka = 20;
