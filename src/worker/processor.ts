import { Job } from 'bullmq';

export interface ProcessorDeps {
  /** Injectable sleep so tests don't wait on the simulated I/O delay. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG so tests can force the success/failure branch. */
  random?: () => number;
  /** Simulated I/O duration in ms. */
  delayMs?: number;
  /** Failure probability (0..1). */
  failureRate?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Factory so the processor's dependencies are injectable in tests. BullMQ calls
// the returned handler as (job, token); it only reads `job`, so the token is
// ignored. Deps must not ride on a second positional param for that reason.
export const createEmailProcessor = (deps: ProcessorDeps = {}) => {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const delayMs = deps.delayMs ?? 1500;
  const failureRate = deps.failureRate ?? 0.2;

  return async (job: Job) => {
    console.log(`[Worker] Started processing email job: ${job.id}`);

    const { userId, type } = job.data;

    // Simulate slow intensive network I/O
    await sleep(delayMs);

    if (random() < failureRate) {
      // Failing throws it back to the queue, relying on the 'exponential backoff'
      // configuration to protect downstream rate limits before ultimately hitting
      // the Dead Letter Queue.
      throw new Error('Simulated upstream SMTP Timeout');
    }

    console.log(`[Worker] Successfully sent ${type} email to user ${userId}`);
    return { status: 'success', sentAt: Date.now() };
  };
};

/** Default processor wired into the Worker. */
export const processEmailJob = createEmailProcessor();
