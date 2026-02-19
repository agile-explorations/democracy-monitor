-- Add cycle-position metadata to baselines table (V3 Addendum §15.3)
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS cycle_year INTEGER;
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS administration VARCHAR(50);
ALTER TABLE baselines ADD COLUMN IF NOT EXISTS calendar_year INTEGER;

-- Backfill existing Biden 2022 baseline rows
UPDATE baselines
SET cycle_year = 2, administration = 'biden', calendar_year = 2022
WHERE baseline_id = 'biden_2022';
