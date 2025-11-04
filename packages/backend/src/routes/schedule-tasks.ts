import express, { Router } from 'express';
import { prisma, redis } from '../fork';
import { requireAdmin } from './users';

const router = Router();

router.use(express.json({ limit: '50mb' }));

// GET /api/schedule-tasks - List all schedule tasks (admin only)
router.get('/', requireAdmin, async (req, res) => {
  const tasks = await prisma.scheduleTask.findMany({
    orderBy: { id: 'asc' },
  });
  res.json(tasks);
});

// PATCH /api/schedule-tasks/:id - Update cron string and enabled (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { cron, enabled } = req.body;
  try {
    const updated = await prisma.scheduleTask.update({
      where: { id: req.params.id },
      data: {
        ...(typeof cron === 'string' ? { cron } : {}),
        ...(typeof enabled === 'boolean' ? { enabled } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update task' });
  }
});

router.post('/:id/run', requireAdmin, async (req, res) => {
  try {
    const taskId = req.params.id;

    redis.publish('run_task', taskId);

    const listenRedis = redis.duplicate();
    await listenRedis.connect();

    // Await a response from the task worker (optional)
    const response: string = await new Promise((resolve) => {
      listenRedis.subscribe(`task_response:${taskId}`, (message) => {
        resolve(message);
      });
    });

    await listenRedis.unsubscribe(`task_response:${taskId}`);
    listenRedis.destroy();

    if (response.startsWith("Error running")) {
      return res.status(500).json({ error: response });
    }

    res.status(200).json({ message: `Task ${taskId} triggered`, response });
  }
  catch (err) {
    res.status(500).json({ error: 'Failed to run task' });
  }
});

export default router;
