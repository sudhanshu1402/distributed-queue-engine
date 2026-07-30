# distributed-queue-engine

[![CI](https://github.com/sudhanshu1402/distributed-queue-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/sudhanshu1402/distributed-queue-engine/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Redis + BullMQ background job engine: priority-aware queuing, exponential-backoff retries, and workers that scale independently of the API. It exists to get slow I/O off the request path.

The worker simulates its I/O on purpose. `src/worker/processor.ts` is a `setTimeout` plus a ~20% random failure, so retries, priority routing, and scaling can be exercised end to end without a live SMTP provider. Swap `createEmailProcessor` for a real send and the plumbing is unchanged.

## The problem

A password-reset email that takes 2s holds the connection open, drags p99 up, and turns a slow SMTP provider into a slow API. Under load it compounds.

Enqueue instead: the API returns `202` in under a millisecond, and workers do the slow part on their own schedule, on their own machines.

## Architecture

```mermaid
graph TB
    Client[Client Request] --> API[Express API Server]
    API -->|"enqueue < 1ms"| Redis[(Redis + AOF Persistence)]
    Redis --> W1[Worker Process 1]
    Redis --> W2[Worker Process 2]
    Redis --> WN[Worker Process N]
    W1 --> SMTP[Upstream SMTP / External Service]
    W2 --> SMTP
    WN --> SMTP
    W1 -->|exhausted retries| DLQ[BullMQ Failed Set]

    subgraph "Horizontally Scalable"
        W1
        W2
        WN
    end

    style API fill:#2d3748,color:#fff
    style Redis fill:#dc2626,color:#fff
    style DLQ fill:#92400e,color:#fff
```

`src/api` and `src/worker` are separate entry points sharing only the queue definition and Redis config. Separate processes, separate containers in production.

## Three decisions worth reading

**Cluster-ready queue names.** The queue is `{emails}:outbound`. That hash tag forces every key for the queue onto one Redis Cluster hash slot, which is what BullMQ's multi-key Lua scripts need if you ever move off a single node. Costs nothing now, saves a migration later.

**Process isolation.** API and workers are independent OS processes with separate npm scripts and separate `CMD`s. Scale workers for throughput without touching the API tier.

**Priority routing.** Password resets enqueue at priority 1, everything else at 10. BullMQ's sorted-set queue drains the urgent ones first.

## What happens when things break

Transient failure retries with backoff (3 attempts: 5s, 10s, 20s), then lands in BullMQ's failed set. A worker that crashes mid-job has it returned by stalled-job recovery. Redis restart replays from AOF. API crash doesn't matter, workers keep draining. `SIGINT`/`SIGTERM` call `worker.close()` so a rolling deploy drains in-flight jobs instead of dropping them.

## Run it

Needs Node 20+ and Docker.

```bash
docker-compose up -d      # Redis with AOF on :6379
npm install
npm run api:dev           # API on :3000
npm run worker:dev        # separate terminal
```

```bash
curl -X POST http://localhost:3000/api/users/reset-password \
  -H "Content-Type: application/json" -d '{"userId": "user_42"}'
# -> {"message":"Password reset initiated asynchronously","jobId":"1"}
```

The worker logs each pickup, completion, and failure. Since the processor fails ~20% of the time by design, you'll watch retries back off and the occasional job exhaust its attempts. Config is env vars, see `.env.example`.

## Tests

```bash
npm test
```

Jest, no live Redis. The processor's `sleep` and RNG are injectable and the producer test mocks `ioredis`/`bullmq`, so it asserts the exact options passed to `queue.add`. Three files cover the success/failure branches, priority routing with retry config, and clean shutdown on both signals. CI runs Node 20 and 22.

## Deploy

Multi-stage `Dockerfile` on `node:22-alpine`, production deps only, non-root user. One image runs both roles:

```bash
docker run -e REDIS_HOST=your-redis queue-engine node dist/api/index.js
docker run -e REDIS_HOST=your-redis queue-engine node dist/worker/index.js
```

`render.yaml` covers a one-service API deploy.

## What it doesn't do

- Single Redis node. Production wants Sentinel, Cluster, or a managed service.
- No backpressure. A downstream provider with rate limits needs BullMQ's limiter.
- Nothing consumes the failed set, so dead letters sit there unalerted.
- Console logs only. Tracing across API, enqueue, and worker would come from [otel-sdk-node](https://github.com/sudhanshu1402/otel-sdk-node).
- No job deduplication, so a retry storm can double-send.

## Deep-dive

Fuller write-up with diagrams at the [System Design Portal](https://sudhanshu1402.github.io/system-design-portal/queue-engine).

## License

MIT
