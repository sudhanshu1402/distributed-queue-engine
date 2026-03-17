import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import { EMAIL_QUEUE_NAME } from '../queue/producer';
import { processEmailJob } from './processor';
import * as dotenv from 'dotenv';
dotenv.config();

const concurrencyLimit = parseInt(process.env.QUEUE_CONCURRENCY || '10', 10);

console.log(`🚀 Booting Worker Process for Queue: ${EMAIL_QUEUE_NAME}`);
console.log(`⚡ Max Concurrency: ${concurrencyLimit}`);

// The Worker is completely decoupled from the Express API Server.
// You can scale these containers horizontally independently of the web traffic edges.
const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  processEmailJob,
  { 
    connection,
    concurrency: concurrencyLimit,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed! Output:`, job.returnvalue);
});

emailWorker.on('failed', (job, err) => {
  console.log(`❌ Job ${job?.id} failed with reason: ${err.message}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await emailWorker.close();
  process.exit(0);
});
