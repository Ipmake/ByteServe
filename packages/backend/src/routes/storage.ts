import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import * as fs from 'fs/promises';
import * as path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mime from 'mime-types';
import { getObjectPath, resolvePath } from '../common/object-nesting';

const router = Router();

// Configure multer for public uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'storage', '.temp');
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// GET /api/storage/:bucketName/* - Public file access
router.get('/:bucketName/*', async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params;
    const filePath = req.params[0] || ''; // Everything after bucketName
    const pathSegments = filePath.split('/').filter(s => s.length > 0);

    // Get bucket
    const bucket = await prisma.bucket.findFirst({
      where: { name: bucketName },
    });

    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check if bucket is public
    if (bucket.access === 'private') {
      return res.status(403).json({ error: 'This bucket is private' });
    }

    // If no path, list bucket root
    if (pathSegments.length === 0) {
      const objects = await prisma.object.findMany({
        where: {
          bucketId: bucket.id,
          parentId: null,
        },
        orderBy: [
          { mimeType: 'desc' }, // folders first
          { filename: 'asc' },
        ],
      });

      return res.json({
        bucket: {
          name: bucket.name,
          access: bucket.access,
        },
        objects: objects.map(obj => ({
          filename: obj.filename,
          isFolder: obj.mimeType === 'folder',
          size: obj.size,
          mimeType: obj.mimeType,
          updatedAt: obj.updatedAt.toISOString(),
        })),
      });
    }

    // Resolve path to object
    const object = await resolvePath(bucketName, pathSegments);

    if (!object) {
      return res.status(404).json({ error: 'File or folder not found' });
    }

    // If it's a folder, list contents
    if (object.mimeType === 'folder') {
      const children = await prisma.object.findMany({
        where: {
          bucketId: bucket.id,
          parentId: object.id,
        },
        orderBy: [
          { mimeType: 'desc' }, // folders first
          { filename: 'asc' },
        ],
      });

      return res.json({
        bucket: {
          name: bucket.name,
          access: bucket.access,
        },
        currentPath: filePath,
        objects: children.map(obj => ({
          filename: obj.filename,
          isFolder: obj.mimeType === 'folder',
          size: obj.size,
          mimeType: obj.mimeType,
          updatedAt: obj.updatedAt.toISOString(),
        })),
      });
    }

    // It's a file - serve it
    const physicalPath = getObjectPath(bucketName, object.id);
    
    // Check if file exists
    try {
      await fs.access(physicalPath);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set content type and send file
    res.setHeader('Content-Type', object.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${object.filename}"`);
    
    const fileBuffer = await fs.readFile(physicalPath);
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving public file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// POST /api/storage/:bucketName/* - Public file upload (for public-write buckets)
router.post('/:bucketName/*', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { bucketName } = req.params;
    const folderPath = req.params[0] || '';
    const pathSegments = folderPath.split('/').filter(s => s.length > 0);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    // Get bucket
    const bucket = await prisma.bucket.findFirst({
      where: { name: bucketName },
    });

    if (!bucket) {
      // Clean up uploaded file
      await fs.unlink(file.path);
      return res.status(404).json({ error: 'Bucket not found' });
    }

    // Check if bucket allows public write
    if (bucket.access !== 'public-write') {
      await fs.unlink(file.path);
      return res.status(403).json({ error: 'This bucket does not allow public uploads' });
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
        await fs.unlink(file.path);
        return res.status(413).json({
          error: 'Bucket storage quota exceeded',
          quota: quotaLimit,
          used: usedStorage,
          required: file.size,
        });
      }
    }

    // Check owner's user quota
    const owner = await prisma.user.findUnique({
      where: { id: bucket.ownerId },
    });

    if (owner && owner.storageQuota !== BigInt(-1)) {
      const currentUsage = await prisma.object.aggregate({
        where: {
          bucket: {
            ownerId: owner.id,
          },
          mimeType: { not: 'folder' },
        },
        _sum: { size: true },
      });

      const usedStorage = currentUsage._sum?.size ? Number(currentUsage._sum.size) : 0;
      const quotaLimit = Number(owner.storageQuota);

      if (usedStorage + file.size > quotaLimit) {
        await fs.unlink(file.path);
        return res.status(413).json({
          error: 'User storage quota exceeded',
          quota: quotaLimit,
          used: usedStorage,
          required: file.size,
        });
      }
    }

    // Resolve parent folder if path provided
    let parentId: string | null = null;
    if (pathSegments.length > 0) {
      const parent = await resolvePath(bucketName, pathSegments);
      if (!parent || parent.mimeType !== 'folder') {
        await fs.unlink(file.path);
        return res.status(404).json({ error: 'Folder not found' });
      }
      parentId = parent.id;
    }

    // Create object in database
    // Detect mime type from filename
    let detectedMime = mime.lookup(file.originalname);
    if (!detectedMime || typeof detectedMime !== 'string') {
      detectedMime = 'application/octet-stream';
    }
    const object = await prisma.object.create({
      data: {
        bucketId: bucket.id,
        filename: file.originalname,
        size: file.size,
        mimeType: detectedMime,
        parentId,
      },
    });

    // Move file to proper location
  // Store file directly in bucket root
  const targetPath = path.join(process.cwd(), 'storage', bucket.name, object.id);
  await fs.rename(file.path, targetPath);

    res.status(201).json({
      message: 'File uploaded successfully',
      filename: object.filename,
      size: Number(object.size),
    });
  } catch (error) {
    console.error('Error handling public upload:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
