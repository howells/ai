BEGIN;

-- Intentionally irreversible: legacy rows contain raw prompts and are excluded
-- from every v0.3 cohort. Apply only after verifying writes to benchmark_runs
-- and benchmark_samples in the target environment.
DROP TABLE IF EXISTS benchmark_results;

COMMIT;
