import { Router } from 'express';
import { prisma } from '../index';
import { AuthLoader } from '../utils/authLoader';
import { requireAdmin } from './users';

const router = Router();

// GET /api/schedule-tasks - List all schedule tasks (admin only)
router.get('/', requireAdmin, async (req, res) => {
  const tasks = await prisma.scheduleTask.findMany();
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

export default router;
