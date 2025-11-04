import { Router, Request, Response } from 'express';
import { prisma } from '../fork';
import Joi from 'joi';
import { AuthLoader } from '../utils/authLoader';
import * as fs from 'fs/promises';
import * as path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mime from 'mime-types';
import express from 'express';

const router = Router();

router.use(express.json({ limit: '50mb' }));

// Configure multer for file uploads (use temp directory, we'll move the file after)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'storage', '.temp');
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Use a temporary unique filename
    cb(null, `${randomUUID()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Helper function to convert BigInt to Number for JSON serialization
const bigIntToNumber = (value: bigint | number): number => {
  return typeof value === 'bigint' ? Number(value) : value;
};

// Validation schemas
const createFolderSchema = Joi.object({
  bucketId: Joi.string().required(),
  filename: Joi.string().min(1).max(512).required(),
  parentId: Joi.string().allow(null).optional(),
});

// GET /api/objects/:bucketId - Get all objects in a bucket (root level or specific folder)
router.get('/:bucketId', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { bucketId } = req.params;
    const { parentId } = req.query;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Verify bucket belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id: bucketId,
        ownerId: user.user.id,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Fetch folders first, then files - both sorted by filename
    const folders = await prisma.object.findMany({
      where: {
        bucketId,
        parentId: parentId ? String(parentId) : null,
        mimeType: 'folder',
      },
      orderBy: { filename: 'asc' },
    });

    const files = await prisma.object.findMany({
      where: {
        bucketId,
        parentId: parentId ? String(parentId) : null,
        NOT: { mimeType: 'folder' },
      },
      orderBy: { filename: 'asc' },
    });

    // Combine folders first, then files
    const objects = [...folders, ...files];

    res.json(
      objects.map((obj) => ({
        id: obj.id,
        bucketId: obj.bucketId,
        filename: obj.filename,
        size: bigIntToNumber(obj.size),
        mimeType: obj.mimeType,
        parentId: obj.parentId,
        createdAt: obj.createdAt.toISOString(),
        updatedAt: obj.updatedAt.toISOString(),
        isFolder: obj.mimeType === 'folder',
      }))
    );
  } catch (error) {
    console.error('Error fetching objects:', error);
    res.status(500).json({ error: 'Failed to fetch objects' });
  }
});

// POST /api/objects/file - Create a new empty file
router.post('/file', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user
    const { error, value } = createFolderSchema.validate(req.body); // Use same schema

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (error) return res.status(400).json({ error: error.details[0].message });

    const { bucketId, filename, parentId } = value;

    // Verify bucket belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id: bucketId,
        ownerId: user.user.id,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    const mimeType = mime.lookup(filename) || 'text/plain';

    // Create object in database
    const file = await prisma.object.create({
      data: {
        bucketId,
        filename,
        size: 0,
        mimeType,
        parentId: parentId || null,
      },
    });

    // Create empty physical file directly in bucket root
    const filePath = path.join(process.cwd(), 'storage', bucket.name, file.id);
    await fs.writeFile(filePath, '', 'utf-8');

    res.status(201).json({
      id: file.id,
      bucketId: file.bucketId,
      filename: file.filename,
      size: bigIntToNumber(file.size),
      mimeType: file.mimeType,
      parentId: file.parentId,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      isFolder: false,
    });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

// POST /api/objects/folder - Create a new folder
router.post('/folder', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user
    const { error, value } = createFolderSchema.validate(req.body);

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { bucketId, filename, parentId } = value;

    // Verify bucket belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id: bucketId,
        ownerId: user.user.id,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check if folder already exists
    const existing = await prisma.object.findFirst({
      where: {
        bucketId,
        filename,
        parentId: parentId || null,
        mimeType: 'folder',
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Folder already exists' });
    }

    // Create folder in database
    const folder = await prisma.object.create({
      data: {
        bucketId,
        filename,
        size: 0,
        mimeType: 'folder',
        parentId: parentId || null,
      },
    });

    // No physical folder creation. Folders are database-only.

    res.status(201).json({
      id: folder.id,
      bucketId: folder.bucketId,
      filename: folder.filename,
      size: bigIntToNumber(folder.size),
      mimeType: folder.mimeType,
      parentId: folder.parentId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      isFolder: true,
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// POST /api/objects/upload - Upload a file
router.post('/upload', AuthLoader, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { bucketId, parentId } = req.body;
    const file = req.file;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Verify bucket belongs to user
    const bucket = await prisma.bucket.findFirst({
      where: {
        id: bucketId,
        ownerId: user.user.id,
      },
      include: {
        owner: true,
      },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check bucket quota
    if (bucket.storageQuota !== BigInt(-1)) {
      const currentUsage = await prisma.object.aggregate({
        where: {
          bucketId: bucket.id,
          mimeType: { not: 'folder' },
        },
        _sum: { size: true },
      });

      const usedStorage = currentUsage._sum?.size ? Number(currentUsage._sum.size) : 0;
      const quotaLimit = Number(bucket.storageQuota);

      if (usedStorage + file.size > quotaLimit) {
        await fs.unlink(file.path).catch(() => { }); // Clean up temp file
        return res.status(413).json({
          error: 'Bucket storage quota exceeded',
          quota: quotaLimit,
          used: usedStorage,
          required: file.size,
        });
      }
    }

    // Check user quota
    if (bucket.owner.storageQuota !== BigInt(-1)) {
      const currentUsage = await prisma.object.aggregate({
        where: {
          bucket: {
            ownerId: user.user.id,
          },
          mimeType: { not: 'folder' },
        },
        _sum: { size: true },
      });

      const usedStorage = currentUsage._sum?.size ? Number(currentUsage._sum.size) : 0;
      const quotaLimit = Number(bucket.owner.storageQuota);

      if (usedStorage + file.size > quotaLimit) {
        await fs.unlink(file.path).catch(() => { }); // Clean up temp file
        return res.status(413).json({
          error: 'User storage quota exceeded',
          quota: quotaLimit,
          used: usedStorage,
          required: file.size,
        });
      }
    }

    // Create object in database
    const object = await prisma.object.create({
      data: {
        bucketId,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        parentId: parentId || null,
      },
    });

    // Move file to proper location with object ID
    const targetPath = await getObjectPath(bucket.name, object.id);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rename(file.path, targetPath);

    res.status(201).json({
      id: object.id,
      bucketId: object.bucketId,
      filename: object.filename,
      size: bigIntToNumber(object.size),
      mimeType: object.mimeType,
      parentId: object.parentId,
      createdAt: object.createdAt.toISOString(),
      updatedAt: object.updatedAt.toISOString(),
      isFolder: false,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// PUT /api/objects/:id - Rename an object
router.put('/:id', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { filename } = req.body;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!filename || !filename.trim()) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Get object and verify ownership through bucket
    const object = await prisma.object.findFirst({
      where: { id },
      include: { bucket: true },
    });

    if (!object || object.bucket.ownerId !== user.user.id) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Update object in database
    const isFolder = object.mimeType === 'folder';
    let newMimeType = object.mimeType;
    if (!isFolder) {
      // Use mime-types to detect new type from filename
      const mime = require('mime-types');
      newMimeType = mime.lookup(filename.trim()) || 'application/octet-stream';
    }
    const updatedObject = await prisma.object.update({
      where: { id },
      data: {
        filename: filename.trim(),
        ...(isFolder ? {} : { mimeType: newMimeType })
      },
    });

    res.json({
      id: updatedObject.id,
      bucketId: updatedObject.bucketId,
      filename: updatedObject.filename,
      size: bigIntToNumber(updatedObject.size),
      mimeType: updatedObject.mimeType,
      parentId: updatedObject.parentId,
      createdAt: updatedObject.createdAt.toISOString(),
      updatedAt: updatedObject.updatedAt.toISOString(),
      isFolder: updatedObject.mimeType === 'folder',
    });
  } catch (error) {
    console.error('Error renaming object:', error);
    res.status(500).json({ error: 'Failed to rename object' });
  }
});

// DELETE /api/objects/:id - Delete an object (file or folder)
router.delete('/:id', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Get object and verify ownership through bucket
    const object = await prisma.object.findFirst({
      where: { id },
      include: { bucket: true },
    });

    if (!object || object.bucket.ownerId !== user.user.id) {
      return res.status(404).json({ error: 'Object not found' });
    }

    // Delete physical file/folder
    const objectPath = await getObjectPath(object.bucket.name, object.id);
    try {
      if (object.mimeType === 'folder') {
        // Deleting folders and their contents could induce cpu spike, so we skip physical deletion (handled by purge task)
      } else await fs.unlink(objectPath);
    } catch (err) {
      console.warn('Failed to delete physical file:', err);
    }

    // Delete from database (cascade will delete children)
    await prisma.object.delete({ where: { id } });

    res.json({ message: 'Object deleted successfully' });
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

// GET /api/objects/:id/content - Get file content for viewing
router.get('/:id/content', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Get object and verify ownership
    const object = await prisma.object.findFirst({
      where: { id },
      include: { bucket: true },
    });

    if (!object || object.bucket.ownerId !== user.user.id) {
      return res.status(404).json({ error: 'Object not found' });
    }

    if (object.mimeType === 'folder') {
      return res.status(400).json({ error: 'Cannot view folder content' });
    }

    const filePath = await getObjectPath(object.bucket.name, object.id);

    // For binary files (images, videos, etc.), send as blob with correct content type
    if (object.mimeType.startsWith('image/') || object.mimeType.startsWith('video/') || object.mimeType.startsWith('audio/')) {
      res.setHeader('Content-Type', object.mimeType);
      const fileBuffer = await fs.readFile(filePath);
      res.send(fileBuffer);
    } else {
      // For text files, send as text
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({
        filename: object.filename,
        mimeType: object.mimeType,
        content,
      });
    }
  } catch (error) {
    console.error('Error getting file content:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

// PUT /api/objects/:id/content - Save file content
router.put('/:id/content', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { content } = req.body;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Get object and verify ownership
    const object = await prisma.object.findFirst({
      where: { id },
      include: { bucket: true },
    });

    if (!object || object.bucket.ownerId !== user.user.id) {
      return res.status(404).json({ error: 'Object not found' });
    }

    if (object.mimeType === 'folder') {
      return res.status(400).json({ error: 'Cannot save folder content' });
    }

    const filePath = await getObjectPath(object.bucket.name, object.id);
    await fs.writeFile(filePath, content, 'utf-8');

    // Update size and updatedAt
    const stats = await fs.stat(filePath);
    const updatedObject = await prisma.object.update({
      where: { id },
      data: {
        size: stats.size,
        updatedAt: new Date(),
      },
    });

    res.json({
      message: 'File saved successfully',
      size: bigIntToNumber(updatedObject.size),
      updatedAt: updatedObject.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error saving file content:', error);
    res.status(500).json({ error: 'Failed to save file content' });
  }
});

// GET /api/objects/:id/download - Download a file
router.get('/:id/download', AuthLoader, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Get object and verify ownership
    const object = await prisma.object.findFirst({
      where: { id },
      include: { bucket: true },
    });

    if (!object || object.bucket.ownerId !== user.user.id) {
      return res.status(404).json({ error: 'Object not found' });
    }

    if (object.mimeType === 'folder') {
      return res.status(400).json({ error: 'Cannot download a folder' });
    }

    const filePath = await getObjectPath(object.bucket.name, object.id);
    res.download(filePath, object.filename);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Helper function to get object path
async function getObjectPath(bucketName: string, objectId: string): Promise<string> {
  return path.join(process.cwd(), 'storage', bucketName, objectId);
}

export default router;
