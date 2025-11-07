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

let isShuttingDown = false;

if (cluster.isPrimary) {
    (async () => {
        console.log(`[Primary] ${process.pid} is running`);

        prisma = new PrismaClient();
        psql = postgres(process.env.DATABASE_URL ?? "", {
            publications: 'alltables'
        });
        redis = createRedisClient({
            url: process.env.REDIS_URL,
            socket: {
                reconnectStrategy: 1000
            }
        });

        redis.on('error', (err) => console.error('[Primary] Redis Client Error', err));

        await redis.connect().then(() => {
            console.log('Connected to Redis successfully');
        }).catch((err) => {
            console.error('Failed to connect to Redis:', err);
        });

        await prisma.$connect();

        // Check TCP congestion control algorithm
        try {
            const congestionControl = await fs.readFile('/proc/sys/net/ipv4/tcp_congestion_control', 'utf-8');
            const algorithm = congestionControl.trim();
            if (algorithm !== 'bbr') {
                console.warn(`\x1b[33m[Warning] TCP congestion control is set to '${algorithm}'. For optimal performance, consider setting it to 'bbr'.\x1b[0m`);
            } else {
                console.log(`[Primary] TCP congestion control: ${algorithm} ✓`);
            }
        } catch (err) {
            console.warn('[Warning] Could not check TCP congestion control setting');
        }

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
            if (isShuttingDown) return;
            console.log(`Thread ${worker.process.pid} died. Restarting...`);
            cluster.fork();
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('[Primary] Shutting down...');
            isShuttingDown = true;

            await prisma?.$disconnect();
            redis?.destroy();

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
    // Threads: Only handle HTTP requests, NO scheduled tasks
    import('./fork.js').then(() => {
        console.log(`Thread ${process.pid} started`);
    });
}