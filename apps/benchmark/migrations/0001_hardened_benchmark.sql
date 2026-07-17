BEGIN;

CREATE TABLE benchmark_sessions (
  id uuid PRIMARY KEY,
  token_digest text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX benchmark_sessions_active_idx
  ON benchmark_sessions (token_digest, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE benchmark_login_throttle (
  principal_hash text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE benchmark_daily_quotas (
  quota_date date PRIMARY KEY,
  charged_attempts integer NOT NULL DEFAULT 0 CHECK (charged_attempts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE benchmark_execution_leases (
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 2),
  run_id uuid UNIQUE,
  lease_expires_at timestamptz
);

INSERT INTO benchmark_execution_leases (slot) VALUES (1), (2);

CREATE TABLE benchmark_runs (
  id uuid PRIMARY KEY,
  request_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  session_id uuid NOT NULL REFERENCES benchmark_sessions(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('rigorous', 'explore')),
  suite_id text,
  suite_version integer,
  prompt_set_hash text NOT NULL,
  options_hash text NOT NULL,
  cohort_hash text NOT NULL,
  hash_key_version integer NOT NULL CHECK (hash_key_version > 0),
  seed integer NOT NULL CHECK (seed >= 0),
  warmup_count integer NOT NULL CHECK (warmup_count >= 0),
  measured_count integer NOT NULL CHECK (measured_count >= 0),
  requested_attempts integer NOT NULL CHECK (requested_attempts BETWEEN 1 AND 50),
  attempted_attempts integer NOT NULL DEFAULT 0 CHECK (attempted_attempts >= 0),
  status text NOT NULL CHECK (status IN ('reserved', 'running', 'completed', 'partial', 'cancelled', 'failed', 'expired')),
  region text NOT NULL,
  app_version text NOT NULL,
  git_version text,
  lease_slot smallint REFERENCES benchmark_execution_leases(slot),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (attempted_attempts <= requested_attempts)
);

CREATE INDEX benchmark_runs_cohort_completed_idx
  ON benchmark_runs (cohort_hash, completed_at DESC)
  WHERE status IN ('completed', 'partial');
CREATE INDEX benchmark_runs_session_idx ON benchmark_runs (session_id, started_at DESC);

CREATE TABLE benchmark_samples (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('warmup', 'measured')),
  status text NOT NULL CHECK (status IN ('success', 'error', 'cancelled')),
  prompt_case_id text NOT NULL,
  prompt_hash text NOT NULL,
  sample_index integer NOT NULL CHECK (sample_index >= 0),
  execution_ordinal integer NOT NULL CHECK (execution_ordinal >= 0),
  logical_model_id text NOT NULL,
  requested_model_id text NOT NULL,
  provider_route text NOT NULL,
  resolved_model_id text,
  backing_provider text,
  route_variant text,
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  ttft_ms integer CHECK (ttft_ms >= 0),
  generation_duration_ms integer CHECK (generation_duration_ms >= 0),
  total_duration_ms integer CHECK (total_duration_ms >= 0),
  cost_micros bigint CHECK (cost_micros >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (run_id, phase, prompt_case_id, sample_index, logical_model_id, provider_route, route_variant)
);

CREATE INDEX benchmark_samples_run_phase_route_idx
  ON benchmark_samples (run_id, phase, provider_route, logical_model_id);

CREATE OR REPLACE FUNCTION reserve_benchmark_run(
  p_run_id uuid,
  p_request_key uuid,
  p_request_hash text,
  p_session_id uuid,
  p_mode text,
  p_suite_id text,
  p_suite_version integer,
  p_prompt_set_hash text,
  p_options_hash text,
  p_cohort_hash text,
  p_hash_key_version integer,
  p_seed integer,
  p_warmup_count integer,
  p_measured_count integer,
  p_requested_attempts integer,
  p_daily_limit integer,
  p_active_limit integer,
  p_region text,
  p_app_version text,
  p_git_version text
) RETURNS TABLE(run_id uuid, existing boolean, lease_slot smallint)
LANGUAGE plpgsql AS $$
DECLARE
  found_run benchmark_runs%ROWTYPE;
  selected_slot smallint;
  today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO found_run FROM benchmark_runs WHERE request_key = p_request_key;
  IF FOUND THEN
    IF found_run.request_hash <> p_request_hash OR found_run.session_id <> p_session_id THEN
      RAISE EXCEPTION 'benchmark/idempotency-mismatch' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT found_run.id, true, found_run.lease_slot;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('benchmark-quota-' || today::text));

  -- Recheck after acquiring the quota lock so concurrent duplicate request keys
  -- converge on the first committed run instead of surfacing a unique violation.
  SELECT * INTO found_run FROM benchmark_runs WHERE request_key = p_request_key;
  IF FOUND THEN
    IF found_run.request_hash <> p_request_hash OR found_run.session_id <> p_session_id THEN
      RAISE EXCEPTION 'benchmark/idempotency-mismatch' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT found_run.id, true, found_run.lease_slot;
    RETURN;
  END IF;

  INSERT INTO benchmark_daily_quotas (quota_date) VALUES (today)
    ON CONFLICT (quota_date) DO NOTHING;

  IF (SELECT charged_attempts FROM benchmark_daily_quotas WHERE quota_date = today FOR UPDATE)
      + p_requested_attempts > p_daily_limit THEN
    RAISE EXCEPTION 'benchmark/daily-quota-exceeded' USING ERRCODE = 'P0001';
  END IF;

  SELECT lease.slot INTO selected_slot
  FROM benchmark_execution_leases AS lease
  WHERE lease.slot <= p_active_limit
    AND (lease.run_id IS NULL OR lease.lease_expires_at < now())
  ORDER BY lease.slot
  FOR UPDATE OF lease SKIP LOCKED
  LIMIT 1;
  IF selected_slot IS NULL THEN
    RAISE EXCEPTION 'benchmark/concurrency-limit' USING ERRCODE = 'P0001';
  END IF;

  -- Expired leases are conservatively consumed: mark the abandoned run without
  -- refunding its reserved attempts before assigning the slot to new work.
  UPDATE benchmark_runs
  SET status = 'expired', completed_at = now()
  WHERE id = (
    SELECT lease.run_id
    FROM benchmark_execution_leases AS lease
    WHERE lease.slot = selected_slot
  )
    AND status IN ('reserved', 'running');

  UPDATE benchmark_execution_leases AS lease
  SET run_id = p_run_id, lease_expires_at = now() + interval '10 minutes'
  WHERE lease.slot = selected_slot;

  INSERT INTO benchmark_runs (
    id, request_key, request_hash, session_id, mode, suite_id, suite_version,
    prompt_set_hash, options_hash, cohort_hash, hash_key_version, seed,
    warmup_count, measured_count, requested_attempts, status, region,
    app_version, git_version, lease_slot
  ) VALUES (
    p_run_id, p_request_key, p_request_hash, p_session_id, p_mode, p_suite_id,
    p_suite_version, p_prompt_set_hash, p_options_hash, p_cohort_hash,
    p_hash_key_version, p_seed, p_warmup_count, p_measured_count,
    p_requested_attempts, 'reserved', p_region, p_app_version, p_git_version,
    selected_slot
  );

  UPDATE benchmark_daily_quotas
  SET charged_attempts = charged_attempts + p_requested_attempts, updated_at = now()
  WHERE quota_date = today;

  RETURN QUERY SELECT p_run_id, false, selected_slot;
END;
$$;

CREATE OR REPLACE FUNCTION mark_benchmark_attempt(p_run_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE benchmark_runs
  SET attempted_attempts = attempted_attempts + 1, status = 'running'
  WHERE id = p_run_id AND attempted_attempts < requested_attempts;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'benchmark/attempt-limit' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_benchmark_run(p_run_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  run benchmark_runs%ROWTYPE;
BEGIN
  SELECT * INTO run FROM benchmark_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF run.status NOT IN ('reserved', 'running') THEN RETURN; END IF;

  UPDATE benchmark_daily_quotas
  SET charged_attempts = GREATEST(0, charged_attempts - (run.requested_attempts - run.attempted_attempts)),
      updated_at = now()
  WHERE quota_date = (run.started_at AT TIME ZONE 'UTC')::date;

  UPDATE benchmark_runs SET status = p_status, completed_at = now() WHERE id = p_run_id;
  UPDATE benchmark_execution_leases SET run_id = NULL, lease_expires_at = NULL WHERE run_id = p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_benchmark_data()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM benchmark_samples WHERE created_at < now() - interval '90 days';
  DELETE FROM benchmark_runs WHERE started_at < now() - interval '90 days'
    AND status NOT IN ('reserved', 'running');
  DELETE FROM benchmark_sessions sesh
  WHERE sesh.expires_at < now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM benchmark_runs retained_run WHERE retained_run.session_id = sesh.id
    );
  DELETE FROM benchmark_login_throttle WHERE updated_at < now() - interval '7 days';
  DELETE FROM benchmark_daily_quotas WHERE quota_date < current_date - 90;
END;
$$;

COMMIT;
