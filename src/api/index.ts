import express from 'express';
import { enqueueEmail } from '../queue/producer';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Main Edge API completely freed from long-running process blocking
app.post('/api/users/reset-password', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Add job to priority queue. 
    // This is virtually instant locally due to ioredis pipeline bridging.
    const job = await enqueueEmail(userId, 'password_reset');
    
    res.status(202).json({ 
      message: 'Password reset initiated asynchronously', 
      jobId: job.id 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/welcome', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Enqueues as a standard priority job
    const job = await enqueueEmail(userId, 'welcome_email');
    
    res.status(202).json({ 
      message: 'Welcome email queued', 
      jobId: job.id 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🌍 Edge Web API Running on port ${port}`);
  console.log(`This process strictly handles HTTP networking, not heavy background execution.`);
});
