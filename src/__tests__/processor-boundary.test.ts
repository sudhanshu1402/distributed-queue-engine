import type { Job } from 'bullmq';
import { createEmailProcessor } from '../worker/processor';

const fakeJob = (data: unknown): Job => ({ id: 'job-1', data } as unknown as Job);

describe('email processor boundaries', () => {
  it('treats random() exactly at the failure rate as a success (strict <)', async () => {
    const process = createEmailProcessor({
      sleep: async () => {},
      random: () => 0.2,
      failureRate: 0.2,
    });

    await expect(
      process(fakeJob({ userId: 'u1', type: 'welcome' }))
    ).resolves.toMatchObject({ status: 'success' });
  });

  it('never fails when the failure rate is 0, even at random() === 0', async () => {
    const process = createEmailProcessor({
      sleep: async () => {},
      random: () => 0,
      failureRate: 0,
    });

    await expect(
      process(fakeJob({ userId: 'u1', type: 'welcome' }))
    ).resolves.toMatchObject({ status: 'success' });
  });

  it('awaits the simulated I/O for the configured duration before deciding', async () => {
    const sleeps: number[] = [];
    const process = createEmailProcessor({
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.99,
      delayMs: 1500,
      failureRate: 0.2,
    });

    await process(fakeJob({ userId: 'u1', type: 'welcome' }));

    expect(sleeps).toEqual([1500]);
  });

  it('surfaces a retryable error so BullMQ applies the configured backoff', async () => {
    const process = createEmailProcessor({
      sleep: async () => {},
      random: () => 0.01,
      failureRate: 0.2,
    });

    await expect(
      process(fakeJob({ userId: 'u1', type: 'welcome' }))
    ).rejects.toThrow('Simulated upstream SMTP Timeout');
  });
});
