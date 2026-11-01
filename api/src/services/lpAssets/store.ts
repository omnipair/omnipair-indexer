import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { IconResult, MetadataResult, PairInput, jobKeys, LEASE_SECONDS, MAX_ATTEMPTS } from './model';

export interface AssetJob {
  key: string; kind: 'icon' | 'metadata'; input: PairInput; dependency_key: string | null;
  state: 'queued' | 'processing' | 'ready' | 'failed'; attempts: number;
  lease_token: string; artifact: IconResult | MetadataResult | null;
  result: IconResult | MetadataResult | null; error_code: string | null;
}

export class LeaseLost extends Error {}

export class LpAssetStore {
  constructor(private readonly db: Pool) {}

  async enqueue(input: PairInput): Promise<string> {
    const keys = jobKeys(input);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO lp_asset_jobs (key, kind, input) VALUES ($1, 'icon', $2)
        ON CONFLICT (key) DO NOTHING`, [keys.icon, input]);
      await client.query(`INSERT INTO lp_asset_jobs (key, kind, input, dependency_key)
        VALUES ($1, 'metadata', $2, $3) ON CONFLICT (key) DO NOTHING`, [keys.metadata, input, keys.icon]);
      await client.query('COMMIT');
      return keys.metadata;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async get(key: string): Promise<AssetJob | null> {
    const result = await this.db.query<AssetJob>(`SELECT j.*,
      CASE WHEN d.state = 'failed' THEN 'failed' ELSE j.state END AS state,
      CASE WHEN d.state = 'failed' THEN d.error_code ELSE j.error_code END AS error_code
      FROM lp_asset_jobs j LEFT JOIN lp_asset_jobs d ON d.key = j.dependency_key WHERE j.key = $1`, [key]);
    return result.rows[0] || null;
  }

  async claim(): Promise<AssetJob | null> {
    // A worker may die on its final attempt. Retire it before selecting more work.
    await this.db.query(`UPDATE lp_asset_jobs SET state = 'failed', error_code = 'retry_exhausted',
      lease_token = NULL, lease_until = NULL, updated_at = now()
      WHERE state = 'processing' AND lease_until <= now() AND attempts >= $1`, [MAX_ATTEMPTS]);
    const result = await this.db.query<AssetJob>(`WITH candidate AS (
      SELECT j.key FROM lp_asset_jobs j
      LEFT JOIN lp_asset_jobs d ON d.key = j.dependency_key
      WHERE j.attempts < $1 AND ((j.state = 'queued' AND j.available_at <= now())
        OR (j.state = 'processing' AND j.lease_until <= now()))
        AND (j.dependency_key IS NULL OR d.state = 'ready')
      ORDER BY j.available_at, j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ) UPDATE lp_asset_jobs j SET state = 'processing', attempts = attempts + 1,
      lease_token = $2, lease_until = now() + $3 * interval '1 second', updated_at = now()
      FROM candidate c WHERE j.key = c.key RETURNING j.*`, [MAX_ATTEMPTS, randomUUID(), LEASE_SECONDS]);
    return result.rows[0] || null;
  }

  private async owned(job: AssetJob, assignment: string, values: unknown[] = []): Promise<void> {
    const result = await this.db.query(`UPDATE lp_asset_jobs SET ${assignment}, updated_at = now()
      WHERE key = $1 AND lease_token = $2 AND state = 'processing' AND lease_until > now()`,
    [job.key, job.lease_token, ...values]);
    if (result.rowCount !== 1) throw new LeaseLost('LP asset lease lost');
  }

  renew(job: AssetJob): Promise<void> {
    return this.owned(job, `lease_until = now() + $3 * interval '1 second'`, [LEASE_SECONDS]);
  }
  checkpoint(job: AssetJob, artifact: IconResult | MetadataResult): Promise<void> {
    return this.owned(job, 'artifact = $3', [artifact]);
  }
  complete(job: AssetJob, result: IconResult | MetadataResult): Promise<void> {
    return this.owned(job, `state = 'ready', result = $3, artifact = NULL, error_code = NULL,
      lease_token = NULL, lease_until = NULL`, [result]);
  }
  fail(job: AssetJob, permanent: boolean): Promise<void> {
    const terminal = permanent || job.attempts >= MAX_ATTEMPTS;
    return this.owned(job, `state = $3, error_code = $4, lease_token = NULL, lease_until = NULL,
      available_at = now() + $5 * interval '1 second'`,
    [terminal ? 'failed' : 'queued', permanent ? 'invalid_mint' : terminal ? 'retry_exhausted' : 'upstream_unavailable',
      Math.min(600, 10 * 2 ** (job.attempts - 1))]);
  }
}
