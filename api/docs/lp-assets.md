# Server-owned LP assets (opt-in)

`POST /api/v1/lp-assets` creates or joins durable PostgreSQL work; a **separate
worker process** generates the icon and metadata and uploads them to Pinata.
It works before a pool exists. Rust ingestion and the periodic token-logo/S3
worker are unchanged. The feature is disabled by default.

## Setup

1. Explicitly apply `database/migrations/018_add_lp_asset_jobs.sql` using the
   repository's migration tooling (or `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f
   database/migrations/018_add_lp_asset_jobs.sql`). This PR never runs a production
   migration or deploys services. The migration adds only the `lp_asset_jobs` table
   and indexes and does not require TimescaleDB.
2. Configure `DATABASE_URL`, `LP_ASSETS_ENABLED=true`, `LP_ASSETS_MAINNET_RPC_URL`,
   `LP_ASSETS_PINATA_JWT`, and `LP_ASSETS_GATEWAY_ORIGIN` for the API and worker.
   Use an existing server-side Pinata credential with public-file upload access.
   Keep its value out of the browser and repository. Gateway must be an HTTPS
   origin (no path/query/userinfo) at most 51 characters long.
3. From `api`, run `npm ci && npm run build`, then start a separate service with
   `npm run start:lp-assets-worker`. `LP_ASSETS_WORKER_CONCURRENCY` defaults to 2
   and accepts 1–4 per process. Allocate CPU/memory independently from API and
   indexing services. `--once` drains currently claimable jobs without waiting for
   future backoff deadlines. SIGTERM/SIGINT stop new claims and finish active work.
4. Enable the API only after the migration and worker are ready. The worker checks
   the RPC genesis hash against Solana mainnet before claiming any jobs. There is
   no client-selectable network. Missing/invalid feature configuration yields 503
   on these routes; other endpoints continue normally. A configured API with no
   live worker returns processing until a worker resumes.

## API contract

```http
POST /api/v1/lp-assets
Content-Type: application/json

{"token0":"So11111111111111111111111111111111111111112","token1":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}
```

Only those two fields are accepted: distinct canonical base58 mint addresses.
The worker verifies initialized SPL Token/Token-2022 mint accounts on mainnet.
There are no file bytes, arbitrary URLs, names, JSON, Pinata options, network, or
risk settings in the request. The current webapp's LP JSON does not include or
vary with market/risk settings, so those settings are deliberately not accepted.
Mints are sorted by raw public-key bytes as in `CreatePools`/`useInitializePool`.

The API waits up to 3 seconds for the shared job. Ready/cache hits return HTTP 200:

```json
{
  "success": true,
  "jobId": "<64-character hex key>",
  "status": "ready",
  "imageUrl": "https://gateway.pinata.cloud/ipfs/<image-cid>",
  "metadataUrl": "https://gateway.pinata.cloud/ipfs/<metadata-cid>",
  "metadata": {
    "name": "SOL/USDC omLP",
    "symbol": "SO.US-omLP",
    "description": "Omnipair LP token for Solana/USD Coin pool",
    "image": "https://gateway.pinata.cloud/ipfs/<image-cid>"
  }
}
```

Pending requests return HTTP 202 with `success`, `jobId`, `status: "processing"`,
`Location: /api/v1/lp-assets/<jobId>`, and `Retry-After: 3`. Poll
`GET /api/v1/lp-assets/<jobId>`; it returns the same 200/202 response shape.
Errors: 400 invalid input/job ID, 415 non-JSON POST, 404 unknown job, 422 terminal
generation failure (`invalid_mint` or `retry_exhausted`), 503 unavailable feature
or database. Internal provider messages, credentials and source URLs are never
returned. Responses use `Cache-Control: no-store`; caching lives in PostgreSQL.
The existing global API rate limiter and body limits apply to both routes.

## Generation, persistence and limits

The worker reads Metaplex metadata or Token-2022's in-mint metadata extension.
Missing metadata uses `Unknown`, matching the indexer's fallback. Names and
symbols come from on-chain metadata, never caller text or off-chain JSON.
Off-chain JSON is used only for its image URI. External metadata/images pass
through HTTPS-only safe fetch with per-hop public-address validation, pinned DNS,
three redirects, and a 10-second total deadline. Limits: 256 KiB metadata JSON,
5 MiB source image, 16M input pixels, 8192 pixels per dimension, 100 animation
frames (decode first frame only), and 5-second Sharp transform timeouts. Remote
SVG and unsupported/failed images fall back to escaped initials; only generated
local SVG is used to draw masks/text. Transient logo failures also produce a
cached placeholder, as the browser generator did.

The PNG preserves the browser's 128×128 stretched token images, left/right
semicircles, transparent corners and subtle white border. Generated uploads are
bounded to 256 KiB PNG / 4 KiB fixed-schema JSON. The name/symbol formatting and
description match the current webapp; UTF-8 byte limits protect Solana's 32/10
byte name/symbol limits for non-ASCII metadata. Gateway URLs are at most 128 bytes
for compatibility with its transaction builder. Font rasterization may differ
from browser placeholders. Server-resolved identities may differ from a token
picker's curated labels; no unverified browser label is trusted.

Icon keys include canonical ordered mints and `GENERATOR_VERSION`; metadata keys
include the icon key, `METADATA_VERSION` and normalized content settings (currently
empty). If settings later affect JSON, validate them and include only normalized
content-affecting values in the metadata key. Do not put those values in the icon
key. Both stages are separate rows, so metadata retries or new metadata versions
reuse the uploaded icon and captured token identities.

Atomic inserts and `FOR UPDATE SKIP LOCKED` claims coordinate API/worker replicas.
Jobs have 120-second leases, heartbeats every 20 seconds, lease-token fencing for
all writes, and at most five attempts. Retries back off 10/20/40/80 seconds; expired
leases are reclaimed and an expired final attempt is retired. Upload results are
checkpointed before completion; a restart can complete a checkpoint without
uploading again. A crash/timeout **between the external upload and its database
checkpoint can still duplicate an upload**. This is not exactly-once delivery.

Ready/failed rows have no automatic expiry; repeat requests do not restart failed
work or refresh immutable content. Operators can inspect `state`, `attempts`,
`lease_until`, and `error_code`. After fixing a transient failure, explicitly reset
only its failed row to `queued`, `attempts=0`, `available_at=now()`, `error_code=NULL`;
retain any artifact checkpoint. Dependency failure is reflected in metadata
status automatically. Do not reset active leased rows. Before changing generator
versions, drain old work and stop old workers to avoid mixed generator execution.
Plan retention and storage monitoring before enabling publicly; deleting cached
rows means requests can upload again.

There is no new authentication or quota system. Existing global rate limiting
remains, but many distinct valid pairs can still create durable jobs, RPC traffic,
and Pinata/storage costs; pair deduplication does not prevent diverse-pair spam.
The webapp migration and removal of its signed-upload route remain separate work.

## Tests

```bash
cd api
npm run test:unit
LP_ASSETS_TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/lp_assets_test npm run test:lp-assets:integration
```

Integration tests require an explicitly supplied isolated test database, create a
temporary schema, apply migration 018 twice, and remove that schema afterward.
They exercise concurrent inserts/claims, cached joins, lease recovery/fencing,
retry backoff/exhaustion, checkpoint recovery, icon reuse and invalid-mint failure.
All external resolution/upload operations are fixtures; tests do not upload to
Pinata. CI runs both suites with a disposable PostgreSQL 17 service. Pinata upload
adapter follows the [public-file API contract](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file).
