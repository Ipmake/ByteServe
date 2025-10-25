import cron, { ScheduledTask } from 'node-cron';

import purgeOldObjects from './tasks/purge_old_objects';
import purgeExpiredTokens from './tasks/purge_expired_tokens';
import { prisma } from '..';
import reportHourlyStats from './tasks/report_hourly_stats';

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
                        default:
                            console.log(`No implementation for task ID: ${row.id}`);
                    }
                });
                this.tasks.push(task);
            });
        });
    }
}