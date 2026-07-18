import { Queue } from 'bullmq';
import { connection } from '../config/redis';

export const EMAIL_QUEUE_NAME = '{emails}:outbound';

// Notice the `{}` hash tag in the queue name.
// This is critical if we ever upgrade to a Redis Cluster configuration.
// It forces all keys related to a specific queue onto the exact same hash slot.

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, { connection });

export const enqueueEmail = async (userId: string, type: string) => {
  return await emailQueue.add(
    'send-notification',
    { userId, type, sendAt: Date.now() },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      priority: type === 'password_reset' ? 1 : 10, // PRIORITY routing
      removeOnComplete: true, // Memory management
    }
  );
};
