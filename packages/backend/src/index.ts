import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { startServer } from './server';

dotenv.config();

// Initialize PGlite client with the database directory
const pgliteClient = new PGlite('./data');

// Initialize the PGlite adapter for Prisma
const adapter = new PrismaPGlite(pgliteClient);

// Create Prisma client with the adapter
const prisma = new PrismaClient({ adapter: adapter as any });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

export { app, prisma };

startServer(PORT).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
