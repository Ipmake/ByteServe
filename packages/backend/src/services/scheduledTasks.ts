import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../';

import purgeOldObjects from './tasks/purge_old_objects';
import purgeExpiredTokens from './tasks/purge_expired_tokens';
import reportHourlyStats from './tasks/report_hourly_stats';
import ssl_cert_renewal from './tasks/ssl_cert_renewal';

export default class ScheduledTasksService {
    private tasks: ScheduledTask[] = [];

    constructor() {
        setInterval(() => {
            // check if any tasks are running currently
            const anyRunning = this.tasks.some(task => task.getStatus() === 'running');
            if (!anyRunning) this.loadTasks();
        }, 5 * 60 * 1000);  // every 5 minutes
        this.loadTasks();
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

                    switch (row.id) {
                        case 'purge_old_objects':
                            purgeOldObjects();
                            break;
                        case 'purge_expired_tokens':
                            purgeExpiredTokens();
                            break;
                        case 'report_hourly_stats':
                            reportHourlyStats();
                            break;
                        case 'ssl_cert_renewal':
                            ssl_cert_renewal();
                            break;
                        default:
                            console.log(`No implementation for task ID: ${row.id}`);
                    }
                });
                this.tasks.push(task);
            });
        });
    }
}