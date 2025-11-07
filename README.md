  # API Throttle (API_Throttle)

A simple, practical API rate-limiting demo that shows identity-aware quotas, distributed token buckets (via Redis), sampled auditing to MongoDB, metrics for Prometheus scraping, and admin controls for runtime policy updates.

This repository contains two main parts:

- `server/` — Node.js Express server implementing the rate limiter, metrics, admin endpoints, Redis + Lua based limiter, and MongoDB sampling.
- `client/` — A tiny frontend (Vite/React) for manual burst testing and exploration of throttling behavior.

# Project Structure

API_Throttle
├── client
│   ├── burst-test.js
│   ├── sustained-test.js
│   ├── multi-instance-test.js
│   ├── package.json
│   └── utils
│       └── request.js
└── server
    ├── package.json
    └── src
        ├── index.js
        ├── metrics.js
        ├── mongo.js
        ├── rateLimiter.js
        ├── rateLimiter.lua
        ├── redis.js
        └── routes
            ├── admin.js
            └── demo.js

Contents
--------

- `server/`
  - `src/index.js` - entrypoint for the API server
  - `src/rateLimiter.js` - rate limiter implementation
  - `src/rateLimiter.lua` - Redis Lua script used by the limiter
  - `src/redis.js`, `src/mongo.js` - adapters for Redis and MongoDB
  - `src/metrics.js` - Prometheus metrics exposition
  - `src/routes/` - `admin.js`, `demo.js` (example routes)
- `client/` — simple UI to exercise endpoints (burst buttons)

Key features
------------

- Per-identity token buckets (API key, JWT sub, or IP fallback)
- Distributed buckets backed by Redis and a Lua script for atomic operations
- Fail-open behavior when Redis is unavailable (server continues to respond)
- Sampled throttle audit entries written to MongoDB
- Prometheus-style metrics at `/metrics`
- Admin API protected by an `x-admin-key` header to update policies at runtime

Quick contract
--------------

- Inputs: HTTP requests to the server with optional `x-api-key` or `Authorization: Bearer <jwt>` headers.
- Outputs: Responses from API endpoints; rate-limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; 429 on throttle.
- Error modes: If Redis is unavailable the limiter should degrade gracefully (allow requests) and log a warning. Admin endpoints require `x-admin-key`.

Prerequisites
-------------

- Node.js 18+ (tested)
- Redis (e.g., redis:7-alpine)
- MongoDB (local or remote)

Quickstart (server)
-------------------

From the repo root, open PowerShell and run:

```powershell
cd server
npm install
```

Create a `.env` (or set env vars) for the server. Example env variables used by the project:

- `PORT` - port for the server (default 3000)
- `REDIS_URL` - e.g. `redis://127.0.0.1:6379`
- `MONGO_URL` - e.g. `mongodb://127.0.0.1:27017/api_throttle`
- `ADMIN_KEY` - admin API key (e.g. `dev-admin`)

Run the server (PowerShell):

```powershell
# set environment for current session (PowerShell)
$env:REDIS_URL = 'redis://127.0.0.1:6379'
$env:MONGO_URL = 'mongodb://127.0.0.1:27017/api_throttle'
$env:ADMIN_KEY = 'dev-admin'
cd server
node src/index.js
```

Quickstart (client)
-------------------

From the repo root:

```powershell
cd client
npm install
npm run dev
```

The client app is a tiny Vite + React UI that can trigger bursts against `/api/hello` and show headers.

Endpoints
---------

- `GET /health` — simple health check. Returns `{ "status": "ok" }`.
- `GET /api/hello` — demo endpoint protected by rate limiter; responds with JSON and rate-limit headers.
- `GET /metrics` — Prometheus metrics (text exposition).
- `POST /admin/policies` — update route policies at runtime. Requires `x-admin-key` header matching `ADMIN_KEY`.

Rate limiting behavior
---------------------

- Rate limits are implemented as token buckets stored in Redis. The server calls a Lua script (`src/rateLimiter.lua`) to perform atomic consume/refill operations.
- Identity resolution (priority order): `x-api-key` header, `Authorization: Bearer <jwt>` (decoded sub & tier — note: in this demo signature verification may be disabled), fallback to client IP.
- Headers returned on each request:
  - `X-RateLimit-Limit` — capacity of the bucket
  - `X-RateLimit-Remaining` — tokens left after the request
  - `X-RateLimit-Reset` — milliseconds until bucket refills
  - `Retry-After` — included on HTTP 429 responses (seconds)

Admin API
---------

Admin endpoints are protected by `x-admin-key`. Use `POST /admin/policies` to push route-specific policies, e.g. capacity and refill rate. Example PowerShell body:

```powershell
$admin='dev-admin'
$body = @{ routes = @{ '/api/heavy' = @{ capacity = 20; refillPerSec = 0.5; ttlSeconds = 180 } } } | ConvertTo-Json -Depth 5

curl http://localhost:3000/admin/policies `
  -Method POST `
  -Headers @{ 'x-admin-key'=$admin; 'Content-Type'='application/json' } `
  -Body $body
```

Persistence & telemetry
-----------------------

- Redis — stores distributed token buckets and runs a Lua script for atomic updates (`src/rateLimiter.lua`).
- MongoDB — sampled throttle audit logs are written to a collection (for example `throttle_audit`) so you can review recent throttle events.
- Prometheus metrics exposed at `/metrics` include counters like `rate_limit_allows_total` and `rate_limit_denies_total` and latency histograms.

Testing & sanity checks
-----------------------

Basic health check:

```powershell
curl http://localhost:3000/health -UseBasicParsing
```

Burst test (PowerShell)

```powershell
1..120 | % {
  curl http://localhost:3000/api/hello -i |
    Select-String -Pattern 'HTTP/|X-RateLimit-|Retry-After'
  Start-Sleep -Milliseconds 50
}
```

Inspect recent throttle audit entries in MongoDB (example):

```powershell
mongosh "mongodb://127.0.0.1:27017/api_throttle" --eval "db.throttle_audit.find().sort({ts:-1}).limit(5).pretty()"
```

Multi-instance testing
----------------------

Run multiple server instances pointing to the same Redis to validate distributed limits. Example (PowerShell):

```powershell
# instance A
$env:PORT=3000; node src/index.js
# instance B (in another terminal)
$env:PORT=3001; node src/index.js
```

Failure modes
-------------

- If Redis is unavailable the limiter should fail-open (allow requests) and log a warning. This demo is built to continue serving traffic rather than blocking it when the backing store is down.

Notes and assumptions
---------------------

- JWT decoding in this demo may not verify signatures; it extracts `sub` and `tier` for identity/tier mapping only.
- The repo is a reference/demo implementation and not hardened for production by default. Consider adding stricter JWT verification, TLS, proper secret storage, rate limit persistence policies, and improved monitoring before production use.

Development checklist & next steps
--------------------------------

- Add unit tests for the Lua script and limiter edge cases.
- Add integration tests that spin up ephemeral Redis and Mongo instances.
- Harden admin auth and add RBAC if needed.

License
-------

This project is provided under the MIT License. See `LICENSE` (if present) for details.

Credits
-------

This demo was assembled to illustrate common patterns for building a distributed API rate limiter with Redis + Lua, Mongo auditing, and Prometheus metrics.

If anything in this README is inaccurate for your local setup, tell me what you want changed and I will update it.
