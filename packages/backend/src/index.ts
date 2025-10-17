import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { startServer } from './server';
import { setupWebDAVServer } from './webdav/index';
import bodyParser from 'body-parser';
import { live } from '@electric-sql/pglite/live';

dotenv.config();

const pgliteClient = new PGlite('./data', {
  extensions: {
    live
  }
});

const adapter = new PrismaPGlite(pgliteClient);

// Create Prisma client with the adapter
const prisma = new PrismaClient({ adapter: adapter as any });

const app = express();
const PORT = process.env.PORT || 3001;

// Mount WebDAV FIRST, with raw body parser for all /dav routes
app.use('/dav', bodyParser.raw({ type: '*/*', limit: '32gb' }));
setupWebDAVServer(app);

// All other middleware/routes after WebDAV
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

export { app, prisma, pgliteClient };

startServer(PORT).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
