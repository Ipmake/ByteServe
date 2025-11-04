import { Router, Request, Response } from 'express';
import { prisma } from '../fork';
import { createReadStream } from 'fs';
import * as path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mime from 'mime-types';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { getObjectPath, getStorageDir, resolvePath } from '../common/object-nesting';
import * as fsPromises from 'fs/promises';
import { updateStatsInRedis } from '../common/stats';

const router = Router();

// Configure multer for public uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'storage', '.temp');
    await fsPromises.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// GET /api/storage/:bucketName/* - Public file access
router.get('/:bucketName/*', async (req: Request, res: Response) => {
  const { bucketName } = req.params;
  const filePath = req.params[0] || ''; // Everything after bucketName
  const pathSegments = filePath.split('/').filter(s => s.length > 0);
  let readStream: ReturnType<typeof createReadStream> | undefined;

  try {
    // Get bucket
    const bucket = await prisma.bucket.findFirst({
      where: { name: bucketName },
      include: { BucketConfig: true },
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
      if (bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') {
        return res.status(403).json({ error: 'May not list folder contents' });
      }

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

      return res.status(200).json({
        bucket: {
          name: bucket.name,
          access: bucket.access,
        },
        objects: objects.map(obj => ({
          filename: obj.filename,
          isFolder: obj.mimeType === 'folder',
          size: Number(obj.size),
          mimeType: obj.mimeType,
          updatedAt: obj.updatedAt.toISOString(),
        })),
      });
    }

    // Resolve path to object
    const object = await resolvePath(bucketName, pathSegments, {
      enabled: bucket.BucketConfig.find(c => c.key === 'cache_path_caching_enable')?.value === 'true',
      ttl: parseInt(bucket.BucketConfig.find(c => c.key === 'cache_path_caching_ttl_seconds')?.value || '300', 10),
    });

    if (!object) {
      return res.status(404).json({ error: 'File or folder not found' });
    }

    // If it's a folder, list contents
    if (object.mimeType === 'folder') {
      if (bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') {
        return res.status(403).json({ error: 'May not list folder contents' });
      }

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

      return res.status(200).json({
        bucket: {
          name: bucket.name,
          access: bucket.access,
        },
        currentPath: filePath,
        objects: children.map(obj => ({
          filename: obj.filename,
          isFolder: obj.mimeType === 'folder',
          size: Number(obj.size),
          mimeType: obj.mimeType,
          updatedAt: obj.updatedAt.toISOString(),
        })),
      });
    }

    // It's a file - serve it with optimized streaming
    const physicalPath = getObjectPath(bucketName, object.id);

    // Update stats in Redis
    await updateStatsInRedis(bucket.id, {
      requestsCount: 1,
      bytesServed: Number(object.size),
      apiRequestsServed: 1,
    });

    try {
      await fsPromises.stat(physicalPath); // Validate file exists

      // Optimize socket
      // Check if this is a range request
      const range = req.headers.range;
      const totalSize = Number(object.size);

      let start = 0;
      let end = totalSize - 1;

      // Handle range requests
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        // Validate range
        if (start >= totalSize || end >= totalSize || start > end) {
          res.status(416).send('Requested range not satisfiable');
          return;
        }

        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': (end - start + 1),
          'Content-Type': object.mimeType,
          'Content-Disposition': `inline; filename="${object.filename}"`
        });
      } else {
        res.status(200).set({
          'Content-Length': totalSize,
          'Content-Type': object.mimeType,
          'Content-Disposition': `inline; filename="${object.filename}"`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });
      }

      // Optimize socket for high-throughput
      if (res.socket) {
        res.socket.setKeepAlive(true, 60000);
        res.socket.setNoDelay(true);
        
        // Increase socket buffer sizes for high-throughput (16MB based on benchmark results)
        try {
          // @ts-ignore - these methods exist but aren't in the types
          if (res.socket.setRecvBufferSize) res.socket.setRecvBufferSize(16 * 1024 * 1024);
          // @ts-ignore
          if (res.socket.setSendBufferSize) res.socket.setSendBufferSize(16 * 1024 * 1024);
        } catch (e) {
          // Ignore if not supported
        }
      }

      const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks - optimal for high-latency connections
      const fileHandle = await fsPromises.open(physicalPath, 'r');
      
      try {
        let position = start;
        const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
        
        while (position <= end) {
          const bytesToRead = Math.min(CHUNK_SIZE, end - position + 1);
          const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, position);
          
          if (bytesRead === 0) break;
          
          const chunk = buffer.subarray(0, bytesRead);
          const canContinue = res.write(chunk);
          position += bytesRead;
          
          // Handle backpressure - wait for drain if write buffer is full
          if (!canContinue) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
          }
        }
        
        res.end();
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      console.error('Error handling public file access:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.destroy();
      }
    }
  } catch (error) {
    console.error('Error handling public file access:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
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
      await fsPromises.unlink(file.path);
      return res.status(400).json({ message: 'Invalid filename' });
    }

    // Check if bucket allows public write
    if (bucket.access !== 'public-write') {
      await fsPromises.unlink(file.path);
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
        await fsPromises.unlink(file.path);
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
        await fsPromises.unlink(file.path);
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
        await fsPromises.unlink(file.path);
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
    await fsPromises.rename(file.path, targetPath);

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
