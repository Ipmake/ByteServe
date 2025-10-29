import { Router, Response } from 'express';
import { prisma } from '../index';
import Joi from 'joi';
import { AuthLoader } from '../utils/authLoader';
import * as fs from 'fs/promises';
import * as path from 'path';
import { $Enums } from '@prisma/client';
import StaticVars from '../common/static';

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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;

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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user } = req.user;
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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
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
        BucketConfig: {
          create: StaticVars.Bucket_Config_Default
        }
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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
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
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
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

    const storagePath = path.join(process.cwd(), 'storage', bucket.name);
    await fs.rm(storagePath, { recursive: true, force: true });

    res.json({ message: 'Bucket deleted successfully' });
  } catch (error) {
    console.error('Error deleting bucket:', error);
    res.status(500).json({ error: 'Failed to delete bucket' });
  }
});

router.get('/:id/config', AuthLoader, async (req, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
    const { id } = req.params;

    // Check if bucket exists and belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id,
        ownerId: user.id,
      },
      include: {
        BucketConfig: true,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    res.json(bucket.BucketConfig.map((config) => ({
      bucketId: config.bucketId,
      key: config.key,
      value: config.value,
      type: config.type,
    } satisfies Config.BucketConfigItem)));
  } catch (error) {
    console.error('Error fetching bucket config:', error);
    res.status(500).json({ error: 'Failed to fetch bucket config' });
  }
});

router.put('/:id/config/:key', AuthLoader, async (req, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
    const { id, key } = req.params;
    const { value } = req.body;

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

    // Update or create the config item
    const updatedConfig = await prisma.bucketConfig.upsert({
      where: {
        bucketId_key: {
          bucketId: bucket.id,
          key: key,
        },
      },
      update: {
        value: value,
      },
      create: {
        bucketId: bucket.id,
        key: key,
        value: value,
        type: $Enums.ConfigType.STRING,
      },
    });

    res.json({
      bucketId: updatedConfig.bucketId,
      key: updatedConfig.key,
      value: updatedConfig.value,
      type: updatedConfig.type,
    } satisfies Config.BucketConfigItem);
  } catch (error) {
    console.error('Error updating bucket config:', error);
    res.status(500).json({ error: 'Failed to update bucket config' });
  }
})

const BulkUpdateBucketConfigSchema = Joi.array().items(
  Joi.object({
    key: Joi.string().required().min(1).max(64),
    value: Joi.string().required().max(256),
    type: Joi.string().valid('STRING', 'NUMBER', 'BOOLEAN').default('STRING'),
  })
)

router.put('/:id/config', AuthLoader, async (req, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
    const { id } = req.params;
    const { error, value } = BulkUpdateBucketConfigSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

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

    const updatedConfigs = [...value.map(async (configItem) => {
      return prisma.bucketConfig.upsert({
        where: {
          bucketId_key: {
            bucketId: bucket.id,
            key: configItem.key,
          },
        },
        update: {
          value: configItem.value,
        },
        create: {
          bucketId: bucket.id,
          key: configItem.key,
          value: configItem.value,
          type: configItem.type as $Enums.ConfigType
        },
      });
    })];

    const results = await Promise.all(updatedConfigs);

    res.json(results.map((config) => ({
      bucketId: config.bucketId,
      key: config.key,
      value: config.value,
      type: config.type,
    } satisfies Config.BucketConfigItem)));
  } catch (error) {
    console.error('Error bulk updating bucket config:', error);
    res.status(500).json({ error: 'Failed to bulk update bucket config' });
  }
})

export default router;
