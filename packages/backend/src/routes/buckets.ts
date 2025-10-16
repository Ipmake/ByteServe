import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import Joi from 'joi';
import { AuthLoader, AuthenticatedRequest } from '../utils/authLoader';
import * as fs from 'fs/promises';
import * as path from 'path';

const router = Router();

// Validation schemas
const createBucketSchema = Joi.object({
  name: Joi.string().min(1).max(64).lowercase().pattern(/^[a-z0-9-]+$/).required()
    .messages({
      'string.pattern.base': 'Bucket name must contain only lowercase letters, numbers, and hyphens'
    }),
  access: Joi.string().valid('private', 'public-read', 'public-write').default('private'),
  storageQuota: Joi.number().integer().min(-1).default(-1), // -1 for unlimited
});

const updateBucketSchema = Joi.object({
  name: Joi.string().min(1).max(64).lowercase().pattern(/^[a-z0-9-]+$/).optional()
    .messages({
      'string.pattern.base': 'Bucket name must contain only lowercase letters, numbers, and hyphens'
    }),
  access: Joi.string().valid('private', 'public-read', 'public-write').optional(),
  storageQuota: Joi.number().integer().min(-1).optional(), // -1 for unlimited
});

// GET /api/buckets - Get all buckets for the authenticated user
router.get('/', AuthLoader, async (req, res: Response) => {
  try {
    const { user, token } = req as AuthenticatedRequest;

    const buckets = await prisma.bucket.findMany({
      where: {
        ownerId: user.id,
      },
      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate used storage for each bucket
    const bucketsWithStorage = await Promise.all(
      buckets.map(async (bucket) => {
        const usedStorage = await prisma.object.aggregate({
          where: {
            bucketId: bucket.id,
            mimeType: { not: 'folder' },
          },
          _sum: { size: true },
        });

        return {
          id: bucket.id,
          name: bucket.name,
          access: bucket.access,
          storageQuota: Number(bucket.storageQuota),
          ownerId: bucket.ownerId,
          createdAt: bucket.createdAt.toISOString(),
          updatedAt: bucket.updatedAt.toISOString(),
          objectCount: bucket._count.entries,
          usedStorage: usedStorage._sum?.size ? Number(usedStorage._sum.size) : 0,
        };
      })
    );

    res.json(bucketsWithStorage);
  } catch (error) {
    console.error('Error fetching buckets:', error);
    res.status(500).json({ error: 'Failed to fetch buckets' });
  }
});

// GET /api/buckets/check/:name - Check if bucket name is available
router.get('/check/:name', AuthLoader, async (req, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { name } = req.params;

    // Validate the name format
    const { error } = Joi.string()
      .min(1)
      .max(64)
      .lowercase()
      .pattern(/^[a-z0-9-]+$/)
      .required()
      .validate(name);

    if (error) {
      return res.json({ available: false, reason: 'Invalid bucket name format' });
    }

    // Check if bucket with this name exists (globally, as bucket names must be unique)
    const existing = await prisma.bucket.findFirst({
      where: {
        name: name.toLowerCase(),
      },
    });

    if (existing) {
      return res.json({ 
        available: false, 
        reason: existing.ownerId === user.id 
          ? 'You already have a bucket with this name' 
          : 'This bucket name is already taken' 
      });
    }

    res.json({ available: true });
  } catch (error) {
    console.error('Error checking bucket name:', error);
    res.status(500).json({ error: 'Failed to check bucket name' });
  }
});

// GET /api/buckets/:id - Get a specific bucket
router.get('/:id', AuthLoader, async (req, res: Response) => {
  try {
    const { user, token } = req as AuthenticatedRequest;
    const { id } = req.params;

    const bucket = await prisma.bucket.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    const usedStorage = await prisma.object.aggregate({
      where: {
        bucketId: bucket.id,
        mimeType: { not: 'folder' },
      },
      _sum: { size: true },
    });

    res.json({
      id: bucket.id,
      name: bucket.name,
      access: bucket.access,
      storageQuota: Number(bucket.storageQuota),
      ownerId: bucket.ownerId,
      createdAt: bucket.createdAt.toISOString(),
      updatedAt: bucket.updatedAt.toISOString(),
      objectCount: bucket._count.entries,
      usedStorage: usedStorage._sum?.size ? Number(usedStorage._sum.size) : 0,
    });
  } catch (error) {
    console.error('Error fetching bucket:', error);
    res.status(500).json({ error: 'Failed to fetch bucket' });
  }
});

// POST /api/buckets - Create a new bucket
router.post('/', AuthLoader, async (req, res: Response) => {
  try {
    const { user, token } = req as AuthenticatedRequest;
    const { error, value } = createBucketSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, access, storageQuota } = value;

    // Check if bucket with same name already exists for this user
    const existing = await prisma.bucket.findFirst({
      where: {
        name,
        ownerId: user.id,
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Bucket with this name already exists' });
    }

    const bucket = await prisma.bucket.create({
      data: {
        name,
        access,
        storageQuota: BigInt(storageQuota),
        ownerId: user.id,
      },
      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    }).catch((err) => {
      throw err;
    });

    // Create storage directory for the bucket
    const storagePath = path.join(process.cwd(), 'storage', bucket.name);
    await fs.mkdir(storagePath, { recursive: true });

    res.status(201).json({
      id: bucket.id,
      name: bucket.name,
      access: bucket.access,
      storageQuota: Number(bucket.storageQuota),
      ownerId: bucket.ownerId,
      createdAt: bucket.createdAt.toISOString(),
      updatedAt: bucket.updatedAt.toISOString(),
      objectCount: bucket._count.entries,
      usedStorage: 0,
    });
  } catch (error) {
    console.error('Error creating bucket:', error);
    res.status(500).json({ error: 'Failed to create bucket: ' + (error as any)?.message });
  }
});

// PUT /api/buckets/:id - Update a bucket
router.put('/:id', AuthLoader, async (req, res: Response) => {
  try {
    const { user, token } = req as AuthenticatedRequest;
    const { id } = req.params;
    const { error, value } = updateBucketSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, access, storageQuota } = value;

    // Check if bucket exists and belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check if new name conflicts with another bucket (only if name is being changed)
    if (name && name !== bucket.name) {
      const existing = await prisma.bucket.findFirst({
        where: {
          name,
          ownerId: user.id,
          NOT: {
            id,
          },
        },
      });

      if (existing) {
        return res.status(409).json({ error: 'Bucket with this name already exists' });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (access) updateData.access = access;
    if (storageQuota !== undefined) updateData.storageQuota = BigInt(storageQuota);

    const updated = await prisma.bucket.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    });

    const usedStorage = await prisma.object.aggregate({
      where: {
        bucketId: updated.id,
        mimeType: { not: 'folder' },
      },
      _sum: { size: true },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      access: updated.access,
      storageQuota: Number(updated.storageQuota),
      ownerId: updated.ownerId,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      objectCount: updated._count.entries,
      usedStorage: usedStorage._sum?.size ? Number(usedStorage._sum.size) : 0,
    });
  } catch (error) {
    console.error('Error updating bucket:', error);
    res.status(500).json({ error: 'Failed to update bucket' });
  }
});

// DELETE /api/buckets/:id - Delete a bucket
router.delete('/:id', AuthLoader, async (req, res: Response) => {
  try {
    const { user, token } = req as AuthenticatedRequest;
    const { id } = req.params;

    // Check if bucket exists and belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    await prisma.bucket.delete({
      where: { id },
    });

    res.json({ message: 'Bucket deleted successfully' });
  } catch (error) {
    console.error('Error deleting bucket:', error);
    res.status(500).json({ error: 'Failed to delete bucket' });
  }
});

export default router;
