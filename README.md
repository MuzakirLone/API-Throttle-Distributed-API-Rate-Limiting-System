### API rate limiting Project

A single, hands-on checklist to verify health, throttling behavior, identity-aware quotas, auditing, metrics, admin protections, failure modes, and multi-instance sharing for your API limiter.

### Prerequisites
- Stack: Node server running on localhost, Redis, MongoDB

- Ports: Server on 3000 (and optionally 3001), Redis accessible, MongoDB on 27017

- Admin key: Set your admin key (example: dev-admin)

- Tools: Browser or curl/PowerShell

- Health check
- Endpoint: Verify the server is reachable.

# Browser
http://localhost:3000/health

# Expect JSON response:
{ "status": "ok" }
Baseline request and headers
Goal: Confirm basic response and presence of rate-limit headers.

bash
# Browser
http://localhost:3000/api/hello

# PowerShell
- curl http://localhost:3000/api/hello -i
- Verify headers:

   X-RateLimit-Limit: Total capacity for the bucket

   X-RateLimit-Remaining: Tokens left in the bucket

   X-RateLimit-Reset: Milliseconds until bucket refills

   Retry-After: Only present on HTTP 429

   Throttle by bursting

- Goal: Deplete the bucket and observe 429s with accurate headers.

- React UI: Path /api/hello → click “Burst x20” repeatedly.

- PowerShell burst:

   ```powershell
  1..120 | % {
  curl http://localhost:3000/api/hello -i |
    Select-String -Pattern 'HTTP/|X-RateLimit-|Retry-After'
  Start-Sleep -Milliseconds 50}
  ```
 
- Expectations:

Some 429 responses: After tokens are exhausted

Headers reflect state: Remaining drops to 0; Reset indicates wait time; Retry-After present on 429

Route-specific stricter policy
- Goal: Apply a stricter policy to /api/heavy via admin endpoint, then confirm faster throttling.

```powershell
$admin="dev-admin" # your ADMIN_KEY
$body = @{
  routes = @{
    "/api/heavy" = @{
      capacity = 20
      refillPerSec = 0.5
      ttlSeconds = 180
    }
  }
} | 
ConvertTo-Json -Depth 5

curl http://localhost:3000/admin/policies `
  -Method POST `
  -Headers @{ "x-admin-key"=$admin; "Content-Type"="application/json" } `
  -Body $body
  ```

Test throttle:
```powershell
1..60 | % {
  curl http://localhost:3000/api/heavy -i |
    Select-String -Pattern 'HTTP/|X-RateLimit-|Retry-After'
  Start-Sleep -Milliseconds 50
}
```

Expectations:

Faster throttling on /api/heavy than /api/hello due to lower capacity and slower refill

Identity: API key vs JWT vs IP
Goal: Verify per-identity quotas: API key, JWT sub, and anonymous IP fallback.

``` bash
# API key identity
curl http://localhost:3000/api/hello -H "x-api-key: demo-key-1" -i
bash
# JWT identity (no signature verification; decodes sub/tier only)
# Example token: sub=u1, tier=admin
# Header:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
# Payload: eyJzdWIiOiJ1MSIsInRpZXIiOiJhZG1pbiJ9
# Token:   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInRpZXIiOiJhZG1pbiJ9.xxx

curl http://localhost:3000/api/hello \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInRpZXIiOiJhZG1pbiJ9.xxx" -i
  ```
- Expectations:

  Distinct quotas per identity: Different API keys or JWT subs have separate buckets

  Anonymous: Requests without key/JWT fall back to IP-based quota

- Mongo audit sampling on throttles
- Goal: Observe sampled throttle audit logs in MongoDB.
```
bash
mongosh "mongodb://127.0.0.1:27017/api_throttle" \
  --eval 'db.throttle_audit.find().sort({ts:-1}).limit(5).pretty()'
  ```
- Expect document fields:

  ts: Timestamp

  route: Matched route path

  userId: Derived identity (API key, JWT sub, or IP)

  tier: Decoded tier from JWT (if provided)

  remaining: Tokens left at decision time

  resetMs: Milliseconds until reset

  headers: Rate-limit headers returned

  correlationId: For request tracing


Metrics

Goal: Confirm Prometheus-style counters and histograms.

```
powershell
curl http://localhost:3000/metrics | Select-String -Pattern 'rate_limit|request_latency_seconds'
Expect to see:

rate_limit_allows_total: Count of allowed requests

rate_limit_denies_total: Count of denied (429) requests

request_latency_seconds: Histogram buckets for request latency
```

Admin protections

Goal: Verify admin endpoints are secured by x-admin-key.

```
bash
# Without key (should fail)
curl http://localhost:3000/admin/policies -i

# With key (should succeed, as in Route-specific stricter policy step)
curl http://localhost:3000/admin/policies -Method POST \
  -Headers "x-admin-key: dev-admin" -H "Content-Type: application/json" \
  -d '{ "routes": { "/api/heavy": { "capacity": 20, "refillPerSec": 0.5, "ttlSeconds": 180 } } }'
  ```

- Expectations:

Unauthorized without key

Successful with valid key

Chaos testing: Redis down (fail-open)

Goal: Validate fail-open behavior when Redis is unavailable.

```bash
# Stop Redis
docker stop api-redis

# Calls should be allowed; limiter degrades gracefully
curl http://localhost:3000/api/hello -i

# Restart Redis
docker start api-redis
```

- Expectations:

  Requests allowed during outage

  Server logs a warning indicating degraded limiter mode

  Normal limiting resumes after Redis restarts

- Optional: multi-instance check
- Goal: Ensure limit sharing across multiple    server instances using the same Redis.

```
powershell
$env:PORT="3001"; cd server; node src/index.js
```
Test burst from both ports with the same identity:

powershell
# Terminal A
```
1..80 | % {
  curl http://localhost:3000/api/hello -H "x-api-key: demo-key-1" -i |
    Select-String -Pattern 'HTTP/|X-RateLimit-|Retry-After'
  Start-Sleep -Milliseconds 50
}
```
# Terminal B
```
1..80 | % {
  curl http://localhost:3001/api/hello -H "x-api-key: demo-key-1" -i |
    Select-String -Pattern 'HTTP/|X-RateLimit-|Retry-After'
  Start-Sleep -Milliseconds 50
}
```
- Expectations:

  Shared limits across instances: Same key/JWT sub consumes a single distributed bucket

  Consistent headers and 429 behavior from either port

- Notes

  Burst intervals: Adjust Start-Sleep to tune   intensity; shorter sleeps deplete buckets faster.

  JWT decoding: Only sub and tier are decoded; signature is not verified in this setup.

  Correlation ID: Use logs to trace throttled requests end-to-end.