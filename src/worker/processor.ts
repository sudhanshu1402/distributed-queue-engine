import { Job } from 'bullmq';

export const processEmailJob = async (job: Job) => {
  console.log(`[Worker] Started processing email job: ${job.id}`);
  
  const { userId, type } = job.data;
  
  // Simulate slow intensive network I/O
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (Math.random() < 0.2) {
    // Failing throws it back to the queue, relying on the 'exponential backoff' configuration 
    // to protect downstream rate limits before ultimately hitting the Dead Letter Queue.
    throw new Error('Simulated upstream SMTP Timeout');
  }

  console.log(`[Worker] Successfully sent ${type} email to user ${userId}`);
  return { status: 'success', sentAt: Date.now() };
};
