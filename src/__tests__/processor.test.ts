import type { Job } from 'bullmq';
import { createEmailProcessor } from '../worker/processor';

const fakeJob = (data: unknown): Job =>
  ({ id: 'job-1', data } as unknown as Job);

describe('email processor', () => {
  it('returns success when the RNG is above the failure threshold', async () => {
    const process = createEmailProcessor({
      sleep: async () => {},
      random: () => 0.99,
      failureRate: 0.2,
    });

    const result = await process(fakeJob({ userId: 'u1', type: 'welcome' }));

    expect(result).toMatchObject({ status: 'success' });
    expect(typeof (result as { sentAt: number }).sentAt).toBe('number');
  });

  it('throws a retryable error when the RNG lands in the failure band', async () => {
    const process = createEmailProcessor({
      sleep: async () => {},
      random: () => 0,
      failureRate: 0.2,
    });

    await expect(
      process(fakeJob({ userId: 'u1', type: 'welcome' }))
    ).rejects.toThrow('Simulated upstream SMTP Timeout');
  });

  it('waits on the injected sleep for the configured delay', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const process = createEmailProcessor({ sleep, random: () => 1, delayMs: 1500 });

    await process(fakeJob({ userId: 'u1', type: 'welcome' }));

    expect(sleep).toHaveBeenCalledWith(1500);
  });
});
