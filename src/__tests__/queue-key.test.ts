// Importing the producer instantiates a BullMQ Queue, which opens a real Redis
// connection unless ioredis and bullmq are mocked first. Same reason as producer.test.ts.
jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({ on: jest.fn(), status: 'ready' }))
);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));

import { EMAIL_QUEUE_NAME } from '../queue/producer';

/**
 * Redis Cluster routes a key by CRC16 of its hash tag: the substring between
 * the first '{' and the first '}' that follows it. If that substring is empty,
 * or there is no tag, the whole key is hashed instead.
 *
 * The README's claim is that '{emails}:outbound' pins every key BullMQ derives
 * for this queue (wait, active, completed, the Lua script keys) to one slot, so
 * BullMQ's multi-key scripts stay legal on a cluster. That only holds while the
 * queue name carries exactly one non-empty hash tag, so it is worth asserting.
 */
const hashTag = (key: string): string | null => {
  const open = key.indexOf('{');
  if (open === -1) return null;
  const close = key.indexOf('}', open + 1);
  if (close === -1 || close === open + 1) return null;
  return key.slice(open + 1, close);
};

describe('queue key cluster safety', () => {
  it('carries a non-empty hash tag, so the key is not hashed whole', () => {
    expect(hashTag(EMAIL_QUEUE_NAME)).toBe('emails');
  });

  it('routes every BullMQ-derived key for this queue to the same hash tag', () => {
    // BullMQ prefixes its internal keys as bull:<queueName>:<suffix>.
    const derived = ['wait', 'active', 'completed', 'failed', 'delayed', 'meta'].map(
      (suffix) => `bull:${EMAIL_QUEUE_NAME}:${suffix}`
    );

    const tags = new Set(derived.map(hashTag));

    expect(tags.size).toBe(1);
    expect(tags.has('emails')).toBe(true);
  });

  it('has only one hash tag, since a second brace pair would not change the slot but signals a naming mistake', () => {
    const openBraces = (EMAIL_QUEUE_NAME.match(/\{/g) ?? []).length;
    expect(openBraces).toBe(1);
  });
});
