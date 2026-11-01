-- Opt-in API/worker feature. Apply explicitly before enabling LP_ASSETS_ENABLED.
BEGIN;
CREATE TABLE IF NOT EXISTS lp_asset_jobs (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
  kind TEXT NOT NULL CHECK (kind IN ('icon', 'metadata')),
  input JSONB NOT NULL,
  dependency_key TEXT REFERENCES lp_asset_jobs(key),
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  artifact JSONB,
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'icon' AND dependency_key IS NULL) OR (kind = 'metadata' AND dependency_key IS NOT NULL)),
  CHECK ((state = 'processing') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK (state <> 'ready' OR result IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lp_asset_jobs_pending_idx ON lp_asset_jobs (available_at, created_at)
  WHERE state IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS lp_asset_jobs_dependency_idx ON lp_asset_jobs (dependency_key);
COMMIT;
