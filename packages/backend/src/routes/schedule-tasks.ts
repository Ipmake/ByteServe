import { Router } from 'express';
import { prisma } from '../index';
import { requireAdmin } from './users';

import purgeOldObjects from '../services/tasks/purge_old_objects';
import purgeExpiredTokens from '../services/tasks/purge_expired_tokens';

const router = Router();

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
  const taskId = req.params.id;

  try {
    switch (taskId) {
      case 'purge_old_objects':
        await purgeOldObjects();
        break;
      case 'purge_expired_tokens':
        await purgeExpiredTokens();
        break;
      default:
        return res.status(400).json({ error: 'Unknown task ID' });
    }

    res.json({ message: `Task ${taskId} executed successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to execute task' });
    console.error(`Error executing task ${taskId}:`, err);
  }
});

export default router;
