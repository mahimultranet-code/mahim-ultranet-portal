-- Align the existing 5-hour Hotspot package with the approved ৳20 price.
-- Safe for databases that already applied an earlier version of migration 0003.
UPDATE packages
SET price_taka = 20
WHERE service_type = 'hotspot'
  AND duration_minutes = 300
  AND duration = '৫ ঘণ্টা'
  AND price_taka = 6
  AND NOT EXISTS (
    SELECT 1 FROM packages
    WHERE service_type = 'hotspot'
      AND duration_minutes = 300
      AND duration = '৫ ঘণ্টা'
      AND price_taka = 20
  );
