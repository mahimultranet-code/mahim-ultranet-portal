-- Idempotent starter catalogue for Mahim UltraNet.
-- Existing matching packages are preserved; only missing price/duration/service combinations are inserted.

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT v.price_taka, v.duration, v.duration_minutes, 1, 5, 'hotspot'
FROM (
SELECT 2 AS price_taka, '৩০ মিনিট' AS duration, 30 AS duration_minutes
UNION ALL
SELECT 4 AS price_taka, '২ ঘণ্টা' AS duration, 120 AS duration_minutes
UNION ALL
SELECT 20 AS price_taka, '৫ ঘণ্টা' AS duration, 300 AS duration_minutes
UNION ALL
SELECT 8 AS price_taka, '৯ ঘণ্টা' AS duration, 540 AS duration_minutes
UNION ALL
SELECT 10 AS price_taka, '১২ ঘণ্টা' AS duration, 720 AS duration_minutes
UNION ALL
SELECT 12 AS price_taka, '১৪ ঘণ্টা' AS duration, 840 AS duration_minutes
UNION ALL
SELECT 14 AS price_taka, '১৬ ঘণ্টা' AS duration, 960 AS duration_minutes
UNION ALL
SELECT 16 AS price_taka, '১ দিন' AS duration, 1440 AS duration_minutes
UNION ALL
SELECT 18 AS price_taka, '২ দিন' AS duration, 2880 AS duration_minutes
UNION ALL
SELECT 26 AS price_taka, '৩ দিন' AS duration, 4320 AS duration_minutes
UNION ALL
SELECT 34 AS price_taka, '৪ দিন' AS duration, 5760 AS duration_minutes
UNION ALL
SELECT 44 AS price_taka, '৫ দিন' AS duration, 7200 AS duration_minutes
UNION ALL
SELECT 52 AS price_taka, '৬ দিন' AS duration, 8640 AS duration_minutes
UNION ALL
SELECT 60 AS price_taka, '৭ দিন' AS duration, 10080 AS duration_minutes
UNION ALL
SELECT 70 AS price_taka, '৮ দিন' AS duration, 11520 AS duration_minutes
UNION ALL
SELECT 78 AS price_taka, '৯ দিন' AS duration, 12960 AS duration_minutes
UNION ALL
SELECT 86 AS price_taka, '১০ দিন' AS duration, 14400 AS duration_minutes
UNION ALL
SELECT 96 AS price_taka, '১১ দিন' AS duration, 15840 AS duration_minutes
UNION ALL
SELECT 114 AS price_taka, '১২ দিন' AS duration, 17280 AS duration_minutes
UNION ALL
SELECT 116 AS price_taka, '১৩ দিন' AS duration, 18720 AS duration_minutes
UNION ALL
SELECT 118 AS price_taka, '১৪ দিন' AS duration, 20160 AS duration_minutes
UNION ALL
SELECT 120 AS price_taka, '১৫ দিন' AS duration, 21600 AS duration_minutes
UNION ALL
SELECT 122 AS price_taka, '১৬ দিন' AS duration, 23040 AS duration_minutes
UNION ALL
SELECT 124 AS price_taka, '১৭ দিন' AS duration, 24480 AS duration_minutes
UNION ALL
SELECT 126 AS price_taka, '১৮ দিন' AS duration, 25920 AS duration_minutes
UNION ALL
SELECT 128 AS price_taka, '১৯ দিন' AS duration, 27360 AS duration_minutes
UNION ALL
SELECT 130 AS price_taka, '২০ দিন' AS duration, 28800 AS duration_minutes
UNION ALL
SELECT 132 AS price_taka, '২১ দিন' AS duration, 30240 AS duration_minutes
UNION ALL
SELECT 134 AS price_taka, '২২ দিন' AS duration, 31680 AS duration_minutes
UNION ALL
SELECT 136 AS price_taka, '২৩ দিন' AS duration, 33120 AS duration_minutes
UNION ALL
SELECT 138 AS price_taka, '২৪ দিন' AS duration, 34560 AS duration_minutes
UNION ALL
SELECT 140 AS price_taka, '২৫ দিন' AS duration, 36000 AS duration_minutes
UNION ALL
SELECT 142 AS price_taka, '২৬ দিন' AS duration, 37440 AS duration_minutes
UNION ALL
SELECT 144 AS price_taka, '২৭ দিন' AS duration, 38880 AS duration_minutes
UNION ALL
SELECT 146 AS price_taka, '২৮ দিন' AS duration, 40320 AS duration_minutes
UNION ALL
SELECT 148 AS price_taka, '২৯ দিন' AS duration, 41760 AS duration_minutes
UNION ALL
SELECT 150 AS price_taka, '১ মাস' AS duration, 43200 AS duration_minutes
UNION ALL
SELECT 280 AS price_taka, '২ মাস' AS duration, 86400 AS duration_minutes
UNION ALL
SELECT 360 AS price_taka, '৩ মাস' AS duration, 129600 AS duration_minutes
UNION ALL
SELECT 400 AS price_taka, '৪ মাস' AS duration, 172800 AS duration_minutes
) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM packages p
  WHERE p.price_taka = v.price_taka
    AND p.duration = v.duration
    AND p.service_type = 'hotspot'
);

INSERT INTO packages (price_taka, duration, duration_minutes, is_active, speed_mbps, service_type)
SELECT 400, '৩০ দিন (Unlimited)', 43200, 1, 10, 'pppoe'
WHERE NOT EXISTS (
  SELECT 1 FROM packages
  WHERE price_taka = 400 AND service_type = 'pppoe'
);
