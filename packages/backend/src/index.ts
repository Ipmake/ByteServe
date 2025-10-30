import cluster from 'cluster';
import os from 'os';
import ScheduledTasksService from './services/scheduledTasks';
import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';
import { Init } from './utils/initServer';
import { createClient as createRedisClient } from "redis";
import path from 'path';
import fs from 'fs/promises';

let prisma: PrismaClient | null = null;

let psql: postgres.Sql<{}> | null = null;

let redis: ReturnType<typeof createRedisClient> | null = null;
export { prisma, psql, redis };

if (cluster.isPrimary) {
    (async () => {
        console.log(`[Primary] ${process.pid} is running`);

        prisma = new PrismaClient();
        psql = postgres(process.env.DATABASE_URL ?? "", {
            publications: 'alltables'
        });
        redis = createRedisClient({
            url: process.env.REDIS_URL
        });

        await redis.connect().then(() => {
            console.log('Connected to Redis successfully');
        }).catch((err) => {
            console.error('Failed to connect to Redis:', err);
        });

        await prisma.$connect();

        // Clean temporary files on startup...
        console.log('Cleaning temporary files...');
        const tempDir = path.join(process.cwd(), "storage", '.temp');
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(tempDir, { recursive: true }).catch(() => { });
        console.log('Temporary files cleaned.');

        await Init();

        // PRIMARY ONLY: Run scheduled tasks here
        const scheduledTasksService = new ScheduledTasksService();
        console.log('[Primary] Scheduled tasks service started');

        // Fork worker processes for handling requests
        const numWorkers = parseInt(process.env.NUM_THREADS || `${os.cpus().length}`);
        for (let i = 0; i < numWorkers; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} died. Restarting...`);
            cluster.fork();
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('[Primary] Shutting down...');

            // Kill all workers
            for (const id in cluster.workers) {
                cluster.workers[id]?.kill();
            }

            // Wait for workers to die
            await new Promise(resolve => setTimeout(resolve, 1000));

            process.exit(0);
        });
    })();
} else {
    // WORKERS: Only handle HTTP requests, NO scheduled tasks
    import('./fork.js').then(() => {
        console.log(`Worker ${process.pid} started`);
    });
}