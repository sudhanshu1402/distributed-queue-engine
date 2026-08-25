# Decisions and failure modes

## Three decisions worth reading

**Cluster-ready queue names.** The queue is `{emails}:outbound`. That hash tag forces every key for the queue onto one Redis Cluster hash slot, which is what BullMQ's multi-key Lua scripts need if you ever move off a single node. Costs nothing now, saves a migration later.

**Process isolation.** API and workers are independent OS processes with separate npm scripts and separate `CMD`s. Scale workers for throughput without touching the API tier.

**Priority routing.** Password resets enqueue at priority 1, everything else at 10. BullMQ's sorted-set queue drains the urgent ones first.

## What happens when things break

Transient failure retries with backoff, then lands in BullMQ's failed set. `attempts: 3` means two retries, and BullMQ's exponential strategy is `2^(attemptsMade-1) * delay`, so with a 5s delay you wait 5s then 10s before the third and last try. A worker that crashes mid-job has it returned by stalled-job recovery. Redis restart replays from AOF. API crash doesn't matter, workers keep draining. `SIGINT`/`SIGTERM` call `worker.close()` behind a 15s cap, so a rolling deploy drains in-flight jobs instead of dropping them, and a close that hangs still exits rather than waiting for SIGKILL.
