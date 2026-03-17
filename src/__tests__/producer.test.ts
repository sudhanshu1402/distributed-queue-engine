import { Queue } from 'bullmq';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      status: 'ready',
    };
  });
});

// Mock BullMQ Queue completely to avoid needing a real Redis server during CI tests
jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => {
      return {
        add: jest.fn().mockResolvedValue({ id: 'dummy-job-id' }),
      };
    }),
  };
});

import { enqueueEmail } from '../queue/producer';

describe('Distributed Queue Producer', () => {
  let mockQueueInstance: any;

  beforeEach(() => {
    (Queue as unknown as jest.Mock).mockClear();
    mockQueueInstance = new Queue('test');
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('should enqueue an email payload successfully', async () => {
    const userId = 'user-123';
    const type = 'welcome';

    const result = await enqueueEmail(userId, type);

    expect(result).toBeDefined();
  });
});
