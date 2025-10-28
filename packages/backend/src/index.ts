import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { startServer } from './server';
import { setupWebDAVServer } from './services/connections/webdav/index';
import bodyParser from 'body-parser';
import { setupS3Server } from './services/connections/s3';
import { createClient as createRedisClient } from "redis";
import postgres from 'postgres';
import Piscina from 'piscina';
import path from 'path';
import os from 'os';

dotenv.config();

// Create Prisma client with the adapter
const prisma = new PrismaClient({});

const psql = postgres(process.env.DATABASE_URL ?? "", {
  publications: 'alltables'
})

const redis = createRedisClient({
  url: process.env.REDIS_URL
});

redis.on('error', (err) => console.error('[Main] Redis Client Error', err));

redis.connect().then(() => {
  console.log('Connected to Redis successfully');
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use('/.well-known/acme-challenge', express.static(path.join(process.cwd(), 'data', 'ssl', '.well-known', 'acme-challenge')));

app.use('/dav/*', bodyParser.raw({
  type: (req) => {
    return true;
  },
  limit: '500mb'
}));
app.use('/s3/*', bodyParser.raw({
  type: (req) => {
    return true;
  },
  limit: '500mb'
}));

setupWebDAVServer(app);
setupS3Server(app);

// All other middleware/routes after WebDAV
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

const workerPool = new Piscina({
  filename: path.resolve(__dirname, 'worker', 'worker.js'),
  maxQueue: 1000,
  concurrentTasksPerWorker: Number(process.env.WORKER_TASKS_PER_THREAD ?? 8),

  minThreads: Math.min(Number(process.env.WORKER_POOL_SIZE ?? os.cpus().length), 2),
  maxThreads: Number(process.env.WORKER_POOL_SIZE ?? os.cpus().length),

  idleTimeout: 6 * 60 * 1000, // 5 minutes
});

console.log(`Worker pool configured with minThreads=${workerPool.options.minThreads} and maxThreads=${workerPool.options.maxThreads}`);

// setInterval(async () => {
//   const completed = workerPool.completed;
//   const queueSize = workerPool.queueSize;
//   const threads = workerPool.threads.length;
//   const utilization = workerPool.utilization;
//   const utilizationPercent = (utilization * 100).toFixed(2);
//   const status = utilization < 0.3 ? '(Low)' : utilization < 0.7 ? '(Moderate)' : '(High)';

//   console.log(`Worker Pool Status:
//   Total Workers: ${threads},
//   Completed Tasks: ${completed},
//   Task Queue Size: ${queueSize},
//   Utilization: ${utilizationPercent}% ${status}`);
// }, 1000); // Log every second

export { app, prisma, redis, psql, workerPool };

startServer(PORT).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  await workerPool.destroy();
  console.log('Server shut down gracefully');
  process.exit(0);
});
