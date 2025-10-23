import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { startServer } from './server';
import { setupWebDAVServer } from './services/connections/webdav/index';
import bodyParser from 'body-parser';
import { live } from '@electric-sql/pglite/live';
import { setupS3Server } from './services/connections/s3';
import { createClient as createRedisClient } from "redis";

dotenv.config();

// Create Prisma client with the adapter
const prisma = new PrismaClient({ });

const redis = createRedisClient({
  url: process.env.REDIS_CONNECTION_STRING
});

redis.on('error', (err) => console.error('Redis Client Error', err));

redis.connect().then(() => {
  console.log('Connected to Redis successfully');

  // flush all keys on startup for a clean state
  redis.flushAll().then(() => {
    console.log('Flushed all keys in Redis on startup');
  }).catch((err) => {
    console.error('Failed to flush Redis keys on startup:', err);
  });
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

const app = express();
const PORT = process.env.PORT || 3001;

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

export { app, prisma, redis };

startServer(PORT).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
