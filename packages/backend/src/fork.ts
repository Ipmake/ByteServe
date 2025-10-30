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
import path from 'path';
import compression from 'compression';

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
}).catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
  res.header('Access-Control-Expose-Headers', 'DAV, content-length, Allow');
  res.header('X-Powered-By', 'ByteServe');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(compression());

app.use('/.well-known/acme-challenge', express.static(path.join(process.cwd(), 'data', 'ssl', '.well-known', 'acme-challenge')));

// app.use('/dav/*', bodyParser.raw({
//   type: (req) => {
//     return true;
//   },
//   limit: '500mb'
// }));
app.use('/s3/*', bodyParser.raw({
  type: (req) => {
    return true;
  },
  limit: '500mb'
}));

app.use("/s/*", (req, res, next) => {
  const url = (req.params as any)[0];
  // Do something with the param
  return res.redirect(`/api/storage/${url}`);
});

setupWebDAVServer(app);
setupS3Server(app);

// All other middleware/routes after WebDAV
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

export { app, prisma, redis, psql };

startServer(PORT).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  redis.destroy();
  console.log('Server shut down gracefully');
  process.exit(0);
});
