\set ON_ERROR_STOP on

BEGIN;

INSERT INTO benchmark_sessions (id, token_digest, expires_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'test-session', now() + interval '1 hour');

SELECT * FROM reserve_benchmark_run(
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'request-a', '00000000-0000-0000-0000-000000000001', 'rigorous',
  'core', 1, 'prompt', 'options', 'cohort', 1, 42, 1, 2, 3, 10, 2,
  'test', '0.3.0', 'test'
);

DO $$
DECLARE duplicate boolean;
BEGIN
  SELECT existing INTO duplicate FROM reserve_benchmark_run(
    '10000000-0000-0000-0000-000000000099',
    '20000000-0000-0000-0000-000000000001',
    'request-a', '00000000-0000-0000-0000-000000000001', 'rigorous',
    'core', 1, 'prompt', 'options', 'cohort', 1, 42, 1, 2, 3, 10, 2,
    'test', '0.3.0', 'test'
  );
  IF duplicate IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'matching request key was not idempotent';
  END IF;

  BEGIN
    PERFORM reserve_benchmark_run(
      '10000000-0000-0000-0000-000000000098',
      '20000000-0000-0000-0000-000000000001',
      'request-b', '00000000-0000-0000-0000-000000000001', 'rigorous',
      'core', 1, 'prompt', 'options', 'cohort', 1, 42, 1, 2, 3, 10, 2,
      'test', '0.3.0', 'test'
    );
    RAISE EXCEPTION 'mismatched idempotency body was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'benchmark/idempotency-mismatch' THEN RAISE; END IF;
  END;
END;
$$;

SELECT mark_benchmark_attempt('10000000-0000-0000-0000-000000000001');
SELECT finalize_benchmark_run('10000000-0000-0000-0000-000000000001', 'completed');
SELECT finalize_benchmark_run('10000000-0000-0000-0000-000000000001', 'completed');

DO $$
BEGIN
  IF (SELECT charged_attempts FROM benchmark_daily_quotas) <> 1 THEN
    RAISE EXCEPTION 'finalization accounting is not idempotent';
  END IF;
  IF EXISTS (SELECT 1 FROM benchmark_execution_leases WHERE run_id IS NOT NULL) THEN
    RAISE EXCEPTION 'finalization did not release its lease';
  END IF;
END;
$$;

SELECT * FROM reserve_benchmark_run(
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  'request-c', '00000000-0000-0000-0000-000000000001', 'explore',
  NULL, NULL, 'prompt-2', 'options', 'cohort-2', 1, 42, 0, 1, 2, 10, 2,
  'test', '0.3.0', 'test'
);
UPDATE benchmark_execution_leases
SET lease_expires_at = now() - interval '1 second'
WHERE run_id = '10000000-0000-0000-0000-000000000002';
SELECT * FROM reserve_benchmark_run(
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003',
  'request-d', '00000000-0000-0000-0000-000000000001', 'explore',
  NULL, NULL, 'prompt-3', 'options', 'cohort-3', 1, 42, 0, 1, 1, 10, 2,
  'test', '0.3.0', 'test'
);

DO $$
BEGIN
  IF (SELECT status FROM benchmark_runs WHERE id = '10000000-0000-0000-0000-000000000002') <> 'expired' THEN
    RAISE EXCEPTION 'expired lease was not conservatively finalized';
  END IF;
  IF (SELECT charged_attempts FROM benchmark_daily_quotas) <> 4 THEN
    RAISE EXCEPTION 'expired reservation was incorrectly refunded';
  END IF;
END;
$$;

INSERT INTO benchmark_samples (
  id, run_id, phase, status, prompt_case_id, prompt_hash, sample_index,
  execution_ordinal, logical_model_id, requested_model_id, provider_route
) VALUES (
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  'measured', 'success', 'explore', 'prompt-3', 0, 0,
  'openai/gpt-5.4-mini', 'openai/gpt-5.4-mini', 'gateway'
);
SELECT finalize_benchmark_run('10000000-0000-0000-0000-000000000003', 'completed');
DELETE FROM benchmark_runs WHERE id = '10000000-0000-0000-0000-000000000003';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM benchmark_samples WHERE run_id = '10000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'sample cascade did not run';
  END IF;
END;
$$;

UPDATE benchmark_runs
SET started_at = now() - interval '91 days', completed_at = now() - interval '91 days'
WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT cleanup_benchmark_data();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM benchmark_runs WHERE id = '10000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'retention cleanup did not remove an expired run';
  END IF;
END;
$$;

INSERT INTO benchmark_sessions (id, token_digest, created_at, expires_at)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'expired-session-with-run',
  now() - interval '3 days',
  now() - interval '2 days'
);
INSERT INTO benchmark_runs (
  id, request_key, request_hash, session_id, mode, prompt_set_hash,
  options_hash, cohort_hash, hash_key_version, seed, warmup_count,
  measured_count, requested_attempts, status, region, app_version, completed_at
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000004', 'request-retained',
  '00000000-0000-0000-0000-000000000004', 'explore', 'prompt-retained',
  'options', 'cohort-retained', 1, 42, 0, 1, 1, 'completed', 'test', '0.3.0', now()
);
SELECT cleanup_benchmark_data();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM benchmark_sessions WHERE id = '00000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'cleanup deleted a session still referenced by retained history';
  END IF;
END;
$$;

ROLLBACK;
