import { Router, Request, Response } from 'express';
import { prisma } from '../fork';
import { createReadStream } from 'fs';
import * as path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mime from 'mime-types';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { FileHandle } from 'fs/promises';
import { getObjectPath, getStorageDir, resolvePath } from '../common/object-nesting';
import * as fsPromises from 'fs/promises';

class BufferedStreamManager {
  private fileHandle: FileHandle | null = null;
  private buffer1: Buffer;
  private buffer2: Buffer;
  private currentBuffer: 1 | 2 = 1;
  private buffer1Filled: boolean = false;
  private buffer2Filled: boolean = false;
  private readInProgress: boolean = false;
  private filePosition: number = 0;
  private error: Error | null = null;
  private actualBytesRead1: number = 0;
  private actualBytesRead2: number = 0;

  constructor(bufferSize: number) {
    this.buffer1 = Buffer.allocUnsafe(bufferSize);
    this.buffer2 = Buffer.allocUnsafe(bufferSize);
  }

  public async initialize(filePath: string): Promise<void> {
    try {
      this.fileHandle = await fsPromises.open(filePath, 'r');
      // Start filling both buffers
      this.fillBuffer(1);
      this.fillBuffer(2);
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(`Failed to initialize stream: ${err.message}`);
      } else {
        throw new Error('Failed to initialize stream: Unknown error');
      }
    }
  }

  private async fillBuffer(bufferNum: 1 | 2): Promise<void> {
    if (this.fileHandle === null || this.readInProgress || (bufferNum === 1 ? this.buffer1Filled : this.buffer2Filled)) {
      return;
    }

    this.readInProgress = true;
    const buffer = bufferNum === 1 ? this.buffer1 : this.buffer2;

    try {
      const result = await this.fileHandle.read(buffer, 0, buffer.length, this.filePosition);
      const bytesRead = result.bytesRead;
      
      if (bytesRead > 0) {
        this.filePosition += bytesRead;
        if (bufferNum === 1) {
          this.buffer1Filled = true;
          this.actualBytesRead1 = bytesRead;
        } else {
          this.buffer2Filled = true;
          this.actualBytesRead2 = bytesRead;
        }
      } else {
        if (bufferNum === 1) {
          this.buffer1Filled = false;
        } else {
          this.buffer2Filled = false;
        }
      }
    } catch (err: unknown) {
      this.error = err instanceof Error ? err : new Error('Unknown error during read');
    } finally {
      this.readInProgress = false;
    }
  }

  public async getNextChunk(): Promise<{ buffer: Buffer; length: number } | null> {
    if (this.fileHandle === null) {
      throw new Error('BufferedStreamManager not initialized');
    }

    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }

    // Wait for current buffer to be filled
    while (this.currentBuffer === 1 && !this.buffer1Filled || 
           this.currentBuffer === 2 && !this.buffer2Filled) {
      if (this.error) {
        const error = this.error;
        this.error = null;
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const currentBufferFilled = this.currentBuffer === 1 ? this.buffer1Filled : this.buffer2Filled;
    const actualBytesRead = this.currentBuffer === 1 ? this.actualBytesRead1 : this.actualBytesRead2;

    if (!currentBufferFilled || actualBytesRead === 0) {
      await this.fileHandle.close();
      this.fileHandle = null;
      return null;
    }

    // Get the current buffer and mark it as not filled
    const buffer = this.currentBuffer === 1 ? this.buffer1 : this.buffer2;
    if (this.currentBuffer === 1) {
      this.buffer1Filled = false;
    } else {
      this.buffer2Filled = false;
    }

    // Start filling the buffer we just emptied
    this.fillBuffer(this.currentBuffer);

    // Switch to the other buffer for next time
    this.currentBuffer = this.currentBuffer === 1 ? 2 : 1;

    return { buffer, length: actualBytesRead };
  }
}

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
      
      // Send headers first
      res.writeHead(200, {
        'Content-Length': Number(object.size),
        'Content-Type': object.mimeType,
        'Content-Disposition': `inline; filename="${object.filename}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });

      // Optimize socket
      if (res.socket) {
        res.socket.setKeepAlive(true);
        res.socket.setNoDelay(true);
      }
      // Initialize the double-buffered stream manager
      const streamManager = new BufferedStreamManager(2 * 1024 * 1024); // 2MB chunks
      await streamManager.initialize(physicalPath);

      // Set up monitoring
      let transferred = 0;
      const timeStart = Date.now();
      let timeLastLog = timeStart;

      // Stream with backpressure handling
      while (true) {
        const chunk = await streamManager.getNextChunk();
        if (!chunk) break;

        const canContinue = res.write(chunk.buffer.subarray(0, chunk.length));
        transferred += chunk.length;

        // Monitor speed
        const now = Date.now();
        if (now - timeLastLog >= 5000) {
          const seconds = (now - timeStart) / 1000;
          const mbps = (transferred / (1024 * 1024)) / seconds;
          console.log(`Transfer speed: ${mbps.toFixed(2)} MB/s`);
          timeLastLog = now;
        }

        if (!canContinue) {
          // Handle backpressure
          await new Promise(resolve => res.once('drain', resolve));
        }
      }

      res.end();
    } catch (error) {
      console.error('Error during file streaming:', error);
      if (!res.headersSent) {
        res.status(500).send('Error during file streaming');
      } else {
        res.destroy();
      }
    }

    const range = req.headers.range;
    const totalSize = Number(object.size);
    
    // Get file stats
    const stats = await fsPromises.stat(physicalPath);
    let start = 0;
    let end = stats.size - 1;

    // Handle range requests
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const contentLength = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': object.mimeType,
        'Content-Disposition': `inline; filename="${object.filename}"`,
      });
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': object.mimeType,
        'Content-Disposition': `inline; filename="${object.filename}"`,
        'Accept-Ranges': 'bytes'
      });
    }

    // Optimize socket for HTTPS streaming
    if (res.socket) {
      res.socket.setKeepAlive(true);
      res.socket.setNoDelay(true);
    }

    // Start monitoring
    let bytesTransferred = 0;
    const startTime = Date.now();
    let lastLog = startTime;

    // Create file stream with large buffer
    const fileStream = createReadStream(physicalPath, {
      start,
      end,
      highWaterMark: 4 * 1024 * 1024 // 4MB buffer size
    });

    // Set up monitoring
    fileStream.on('data', (chunk) => {
      bytesTransferred += chunk.length;
      const now = Date.now();
      
      // Log transfer speed every 5 seconds
      if (now - lastLog >= 5000) {
        const seconds = (now - startTime) / 1000;
        const mbps = (bytesTransferred / (1024 * 1024)) / seconds;
        console.log(`Transfer speed: ${mbps.toFixed(2)} MB/s`);
        lastLog = now;
      }
    });

    // Handle errors
    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    // Use pipe with proper error handling
    await new Promise((resolve, reject) => {
      fileStream
        .pipe(res)
        .on('finish', resolve)
        .on('error', reject);
    });
  } catch (err) {
    console.error('Error streaming file:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream file' });
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
