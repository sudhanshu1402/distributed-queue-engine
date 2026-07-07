// ioredis and BullMQ are mocked so the producer's routing / retry configuration
// can be asserted without a live Redis. The Queue mock records every `add(...)`
// call so we can inspect the exact options the producer passes to BullMQ.
jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({ on: jest.fn(), status: 'ready' }))
);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' }),
  })),
}));

import { enqueueEmail, emailQueue } from '../queue/producer';

const addMock = emailQueue.add as unknown as jest.Mock;

describe('email producer', () => {
  beforeEach(() => addMock.mockClear());

  it('adds a send-notification job carrying the user payload', async () => {
    await enqueueEmail('user-123', 'welcome');

    expect(addMock).toHaveBeenCalledTimes(1);
    const [name, payload] = addMock.mock.calls[0];
    expect(name).toBe('send-notification');
    expect(payload).toMatchObject({ userId: 'user-123', type: 'welcome' });
    expect(typeof payload.sendAt).toBe('number');
  });

  it('routes password_reset at high priority (1) and other mail at low priority (10)', async () => {
    await enqueueEmail('u1', 'password_reset');
    await enqueueEmail('u2', 'welcome');

    expect(addMock.mock.calls[0][2].priority).toBe(1);
    expect(addMock.mock.calls[1][2].priority).toBe(10);
  });

  it('configures 3 attempts with 5s exponential backoff and removeOnComplete', async () => {
    await enqueueEmail('u1', 'welcome');

    const opts = addMock.mock.calls[0][2];
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 5000 });
    expect(opts.removeOnComplete).toBe(true);
  });
});
