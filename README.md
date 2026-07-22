# Distributed Queue Engine

[![CI](https://github.com/sudhanshu1402/distributed-queue-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/sudhanshu1402/distributed-queue-engine/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A reference implementation of a Redis + BullMQ background job engine: priority-aware queuing, exponential-backoff retries, and worker processes that scale independently of the API. It exists to move slow I/O off the request path.

> **Scope note:** this demonstrates the queue and worker *mechanics*, not a real email service. The worker deliberately **simulates** I/O — a `setTimeout` plus a random failure in `src/worker/processor.ts` — so retries, priority routing, and scaling can be exercised end to end without a live SMTP provider. Swap `createEmailProcessor` for a real send call and the plumbing stays the same.

## The problem

Sending email inline blocks the request. A password-reset send that takes 2s holds the connection open, pushes up p99 latency, and turns a slow SMTP provider into a slow API. Under load that compounds.

Pushing the work to a queue decouples the two: the API enqueues and returns `202` immediately, and workers do the slow part on their own schedule and their own machines.

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

The API (`src/api`) and the worker (`src/worker`) are separate entry points that share only the queue definition and Redis connection config. They run as separate processes and, in production, separate containers.

**Design choices worth calling out:**

- **Process isolation.** API and workers are independent OS processes (separate `npm` scripts, separate `CMD`). You scale workers for throughput without touching the API tier.
- **Cluster-ready queue names.** The queue is named `{emails}:outbound`. The `{}` hash tag forces every key for the queue onto the same Redis Cluster hash slot, which is what BullMQ's multi-key Lua operations need if you ever move from a single node to a cluster. No code changes required later.
- **Priority routing.** Password resets enqueue at priority `1`; everything else at `10`. BullMQ's sorted-set priority queue dequeues the urgent jobs first.

## Tech stack

| Technology | Why it's here |
|---|---|
| **BullMQ 5.x** | Redis-backed queue with priority, retries, and Lua-scripted atomic ops. Simpler to run than RabbitMQ or SQS for a self-hosted setup. |
| **Redis 7 (AOF)** | Append-only-file persistence so queued jobs survive a restart. Runs from the `redis:7-alpine` image. |
| **ioredis** | Cluster-aware client. `maxRetriesPerRequest: null` is set because BullMQ's blocking pop pattern requires it. |
| **TypeScript** | Shared job-payload types keep the producer and consumer honest about what's on the wire. |
| **Express 5** | Thin HTTP layer. Its only job is to accept a request and enqueue. |

## What it does

- **Two enqueue endpoints** — `POST /api/users/reset-password` (priority 1) and `POST /api/users/welcome` (priority 10), both returning `202` with a job ID.
- **Exponential-backoff retries** — 3 attempts, 5s base delay (5s, 10s, 20s), then the job lands in BullMQ's failed set.
- **Configurable concurrency** — each worker processes up to `QUEUE_CONCURRENCY` jobs in parallel (default 10).
- **Graceful shutdown** — `SIGINT`/`SIGTERM` handlers call `worker.close()` to drain in-flight jobs before exit, so a rolling deploy or Ctrl-C doesn't drop work.
- **Bounded Redis memory** — `removeOnComplete: true` clears successful jobs instead of letting the completed set grow forever.

## Failure handling

1. **Transient send failure** — the job throws, BullMQ retries it with backoff.
2. **Still failing after 3 attempts** — it moves to the failed set (the dead-letter path).
3. **Worker crashes mid-job** — BullMQ's stalled-job recovery returns the job to the queue for another worker.
4. **Redis restarts** — AOF replays pending jobs from disk.
5. **API crashes** — workers keep draining the queue; nothing in flight is lost.

## Setup

Needs Node 20+ and Docker (for Redis).

```bash
# 1. Start Redis (AOF enabled, port 6379)
docker-compose up -d

# 2. Install deps
npm install

# 3. Run the API on :3000
npm run api:dev

# 4. In another terminal, run a worker
npm run worker:dev
```

Config comes from environment variables (see `.env.example`): `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `QUEUE_CONCURRENCY`, `PORT`.

## Usage

```bash
# High-priority job (priority 1)
curl -X POST http://localhost:3000/api/users/reset-password \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_42"}'
# -> {"message":"Password reset initiated asynchronously","jobId":"1"}

# Standard-priority job (priority 10)
curl -X POST http://localhost:3000/api/users/welcome \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_42"}'
# -> {"message":"Welcome email queued","jobId":"2"}
```

The worker terminal logs each job as it's picked up, completed, or failed. Because the processor fails ~20% of the time by design, you'll see retries with backoff and the occasional job exhaust its attempts.

## Tests

```bash
npm test
```

Jest + ts-jest, no live Redis needed. The processor's `sleep` and RNG are injectable, and the producer test mocks `ioredis`/`bullmq` so it can assert the exact options passed to `queue.add`. Coverage:

- `processor.test.ts` — success/failure branches and the simulated delay.
- `producer.test.ts` — priority routing (1 vs 10), and the `attempts`/`backoff`/`removeOnComplete` config.
- `shutdown.test.ts` — worker closes then exits 0, and both signals register.

CI (`.github/workflows/ci.yml`) runs the build and tests on Node 20 and 22.

## Deployment

The `Dockerfile` is a multi-stage build (`node:22-alpine`, production deps only, runs as the non-root `node` user). The same image runs both roles with different commands:

```bash
docker build -t queue-engine .
docker run -e REDIS_HOST=your-redis queue-engine node dist/api/index.js
docker run -e REDIS_HOST=your-redis queue-engine node dist/worker/index.js
```

There's also a `render.yaml` for a one-service (API) deploy on Render's free tier.

## Where this would go next

This is a demo, so a few things are intentionally left out. If it were headed for production:

| Dimension | Here | Production path |
|---|---|---|
| **Throughput** | Single worker, concurrency 10 | Add workers linearly; BullMQ's own benchmarks put a worker in the thousands-of-jobs/s range before Redis becomes the limit |
| **Persistence** | Single Redis, AOF | Redis Sentinel/Cluster, or a managed service (ElastiCache, Upstash) |
| **Observability** | Console logs | OpenTelemetry spans across API → enqueue → worker (see [otel-sdk-node](https://github.com/sudhanshu1402/otel-sdk-node)) |
| **Backpressure** | None | BullMQ rate limiter to respect downstream provider limits |
| **Dead letters** | BullMQ failed set | A consumer on the failed set with alerting |

Other ideas: a BullMQ Board UI for monitoring and manual retry, cron-scheduled jobs, and job deduplication via custom IDs to avoid duplicate sends during retry storms.

## Deep-dive

A fuller system-design write-up with diagrams lives at the [System Design Portal](https://sudhanshu1402.github.io/system-design-portal/queue-engine).

## License

MIT — see [LICENSE](LICENSE).
