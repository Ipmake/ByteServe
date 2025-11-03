import { Router, Request, Response } from 'express';
import { prisma } from '../fork';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mime from 'mime-types';
import { getObjectPath, getStorageDir, resolvePath } from '../common/object-nesting';
import { updateStatsInRedis } from '../common/stats';

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
      if (bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') return res.status(403).json({ error: 'May not list folder contents' });
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
      if (bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') return res.status(403).json({ error: 'May not list folder contents' });
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

    await updateStatsInRedis(bucket.id, {
      requestsCount: 1,
      bytesServed: Number(object.size),
      apiRequestsServed: 1,
    });

    const range = req.headers.range;
    const totalSize = Number(object.size);
    const CHUNK_SIZE = 256 * 1024; // 256KB chunks

    try {
      // Use native fs.read for better performance
      const fd = await fs.open(physicalPath, 'r');
      const stats = await fd.stat();

      let startPos = 0;
      let endPos = stats.size - 1;

      // Handle range requests
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        startPos = parseInt(parts[0], 10);
        endPos = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const contentLength = endPos - startPos + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${startPos}-${endPos}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength,
          'Content-Type': object.mimeType,
          'Content-Disposition': `inline; filename="${object.filename}"`,
        });
      } else {
        // Handle full file requests
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': object.mimeType,
          'Content-Disposition': `inline; filename="${object.filename}"`,
          'Accept-Ranges': 'bytes'
        });
      }

      // Set socket options
      if (res.socket) {
        res.socket.setKeepAlive(true);
        res.socket.setNoDelay(true);
      }

      // Stream the file
      let position = startPos;
      let transferStart = process.hrtime();
      let transferred = 0;

      while (position <= endPos) {
        const buffer = Buffer.allocUnsafe(Math.min(CHUNK_SIZE, endPos - position + 1));
        const { bytesRead } = await fd.read(buffer, 0, buffer.length, position);

        if (bytesRead === 0) break;

        const canContinue = res.write(buffer.subarray(0, bytesRead));
        position += bytesRead;
        transferred += bytesRead;

        // Log transfer speed every 5 seconds
        const elapsed = process.hrtime(transferStart);
        const seconds = elapsed[0] + elapsed[1] / 1e9;
        if (Math.floor(seconds) % 5 === 0) {
          const mbps = (transferred / (1024 * 1024)) / seconds;
          console.log(`Transfer speed: ${mbps.toFixed(2)} MB/s`);
        }

        if (!canContinue) {
          // Handle backpressure
          await new Promise(resolve => res.once('drain', resolve));
        }
      }

      res.end();
      await fd.close();
    } catch (err) {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    }

    // Monitor streaming performance
    const startTime = process.hrtime();
    let bytesTransferred = 0;

    const fileStream = createReadStream(physicalPath);

    fileStream.on('data', (chunk) => {
      bytesTransferred += chunk.length;

      // Log transfer speed every 5 seconds
      const elapsed = process.hrtime(startTime);
      const seconds = elapsed[0] + elapsed[1] / 1e9;
      if (Math.floor(seconds) % 5 === 0) {
        const mbps = (bytesTransferred / (1024 * 1024)) / seconds;
        console.log(`Transfer speed: ${mbps.toFixed(2)} MB/s`);
      }
    });

    fileStream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    // Enable keep-alive and optimize TCP
    if (res.socket) {
      res.socket.setKeepAlive(true);
      res.socket.setNoDelay(true);
    }

    // Handle backpressure explicitly
    const stream = fileStream.pipe(res, { end: true });

    stream.on('drain', () => {
      fileStream.resume();
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      fileStream.destroy();
    });
  } catch (err) {
    console.error('Error setting up file stream:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to set up file stream' });
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
