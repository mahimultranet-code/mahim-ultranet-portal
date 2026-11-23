-- Idempotent starter catalogue for Mahim UltraNet.
-- Use separate INSERT statements instead of a large UNION ALL chain,
-- which exceeds the compound-SELECT limit in the remote D1 SQLite runtime.
-- Existing matching packages are preserved.

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 2, '৩০ মিনিট', 30, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 2
    AND duration = '৩০ মিনিট'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 4, '২ ঘণ্টা', 120, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 4
    AND duration = '২ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 20, '৫ ঘণ্টা', 300, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 20
    AND duration = '৫ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 8, '৯ ঘণ্টা', 540, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 8
    AND duration = '৯ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 10, '১২ ঘণ্টা', 720, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 10
    AND duration = '১২ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 12, '১৪ ঘণ্টা', 840, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 12
    AND duration = '১৪ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 14, '১৬ ঘণ্টা', 960, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 14
    AND duration = '১৬ ঘণ্টা'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 16, '১ দিন', 1440, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 16
    AND duration = '১ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 18, '২ দিন', 2880, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 18
    AND duration = '২ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 26, '৩ দিন', 4320, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 26
    AND duration = '৩ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 34, '৪ দিন', 5760, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 34
    AND duration = '৪ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 44, '৫ দিন', 7200, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 44
    AND duration = '৫ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 52, '৬ দিন', 8640, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 52
    AND duration = '৬ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 60, '৭ দিন', 10080, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 60
    AND duration = '৭ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 70, '৮ দিন', 11520, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 70
    AND duration = '৮ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 78, '৯ দিন', 12960, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 78
    AND duration = '৯ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 86, '১০ দিন', 14400, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 86
    AND duration = '১০ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 96, '১১ দিন', 15840, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 96
    AND duration = '১১ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 114, '১২ দিন', 17280, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 114
    AND duration = '১২ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 116, '১৩ দিন', 18720, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 116
    AND duration = '১৩ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 118, '১৪ দিন', 20160, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 118
    AND duration = '১৪ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 120, '১৫ দিন', 21600, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 120
    AND duration = '১৫ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 122, '১৬ দিন', 23040, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 122
    AND duration = '১৬ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 124, '১৭ দিন', 24480, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 124
    AND duration = '১৭ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 126, '১৮ দিন', 25920, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 126
    AND duration = '১৮ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 128, '১৯ দিন', 27360, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 128
    AND duration = '১৯ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 130, '২০ দিন', 28800, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 130
    AND duration = '২০ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 132, '২১ দিন', 30240, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 132
    AND duration = '২১ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 134, '২২ দিন', 31680, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 134
    AND duration = '২২ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 136, '২৩ দিন', 33120, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 136
    AND duration = '২৩ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 138, '২৪ দিন', 34560, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 138
    AND duration = '২৪ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 140, '২৫ দিন', 36000, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 140
    AND duration = '২৫ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 142, '২৬ দিন', 37440, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 142
    AND duration = '২৬ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 144, '২৭ দিন', 38880, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 144
    AND duration = '২৭ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 146, '২৮ দিন', 40320, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 146
    AND duration = '২৮ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 148, '২৯ দিন', 41760, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 148
    AND duration = '২৯ দিন'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 150, '১ মাস', 43200, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 150
    AND duration = '১ মাস'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 280, '২ মাস', 86400, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 280
    AND duration = '২ মাস'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 360, '৩ মাস', 129600, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 360
    AND duration = '৩ মাস'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 400, '৪ মাস', 172800, 1, 5, 'hotspot'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 400
    AND duration = '৪ মাস'
    AND service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 400, '৩০ দিন (Unlimited)', 43200, 1, 10, 'pppoe'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 400 AND service_type = 'pppoe'
);
