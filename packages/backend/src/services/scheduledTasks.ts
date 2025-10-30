import cron, { ScheduledTask } from 'node-cron';
import { prisma, redis } from '../';

import purgeOldObjects from './tasks/purge_old_objects';
import purgeExpiredTokens from './tasks/purge_expired_tokens';
import reportHourlyStats from './tasks/report_hourly_stats';
import ssl_cert_renewal from './tasks/ssl_cert_renewal';
import migrationRunConfPopulation from './tasks/migration_run_confpopulation';

export default class ScheduledTasksService {
    private tasks: ScheduledTask[] = [];

    constructor() {
        setInterval(() => {
            // check if any tasks are running currently
            const anyRunning = this.tasks.some(task => task.getStatus() === 'running');
            if (!anyRunning) this.loadTasks();
        }, 5 * 60 * 1000);  // every 5 minutes
        this.loadTasks();


        const listenRedis = redis?.duplicate();
        listenRedis?.connect().then(() => {
            listenRedis.subscribe('run_task', async (taskId: string) => {
                console.log(`Received run_task message for task ID: ${taskId}`);
                await this.runTaskById(taskId).catch(err => {
                    console.error(`Error running task ID ${taskId}:`, err);
                    redis?.publish(`task_response:${taskId}`, `Task ${taskId} failed: ${err.message}`);
                }).then(() => {
                    redis?.publish(`task_response:${taskId}`, `Task ${taskId} completed successfully`);
                });
            });
        });
    }

    private async loadTasks() {
        if (!prisma) throw new Error("Redis or Prisma not initialized");

        prisma.scheduleTask.findMany().then(tasks => {
            console.log('Loaded scheduled tasks from database.');
            // Clear existing tasks
            this.tasks.forEach(task => task.stop());
            this.tasks = [];

            tasks.forEach((row: any) => {
                if (!row.enabled) return;

                const task = cron.schedule(row.cron, () => {
                    console.log(`Executing scheduled task: ${row.displayName} (ID: ${row.id})`);

                    this.runTaskById(row.id);
                });
                this.tasks.push(task);
            });
        });
    }

    private async runTaskById(taskId: string) {
        switch (taskId) {
            case 'purge_old_objects':
                await purgeOldObjects();
                break;
            case 'purge_expired_tokens':
                await purgeExpiredTokens();
                break;
            case 'report_hourly_stats':
                await reportHourlyStats();
                break;
            case 'ssl_cert_renewal':
                await ssl_cert_renewal();
                break;
            case 'migration_run_confpopulation':
                await migrationRunConfPopulation();
                break;
            default:
                console.log(`No implementation for task ID: ${taskId}`);
                throw new Error(`No implementation for task ID: ${taskId}`);
                break;
        }
    }
}
