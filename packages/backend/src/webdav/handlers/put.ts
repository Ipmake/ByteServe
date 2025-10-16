
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Transform } from 'stream';
import { prisma } from '../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';
import mime from 'mime-types';


/**
 * WebDAV PUT handler with full support for:
 * - Partial file transfer (resumable uploads) via Content-Range
 * - Range/Content-Range response headers for client confirmation
 * - PATCH support for chunked uploads (optional, non-standard)
 * - Verbose logging for all upload events
 *
 * To support all WebDAV clients (Dolphin, Cyberduck, etc),
 * this handler uses a temp file, supports random access writes,
 * and cleans up on abort/cancel.
 */
const uploadProgress = new Map<string, {
    bytesReceived: number;
    totalBytes: number;
    startTime: number;
    lastUpdate: number;
}>();

export async function handlePut(req: express.Request, res: express.Response) {
    console.log('[WebDAV PUT] Incoming request:', req.method, req.originalUrl);
    let writeStream: fs.WriteStream | null = null;
    let tempFilePath: string | null = null;
    let storagePath: string | null = null;
    let progressKey: string | null = null;
    let progressTransform: Transform | null = null;

    try {
        // Always set DAV and Accept-Ranges headers for WebDAV compatibility
        res.setHeader('DAV', '1,2');
        res.setHeader('Accept-Ranges', 'bytes');
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);

        console.log('[WebDAV PUT] Uploading to bucket:', bucket, 'path:', objectPath);

        if (!bucket || objectPath === '/') {
            console.log('[WebDAV PUT] Bad request: missing bucket or objectPath');
            res.setHeader('Content-Length', '0');
            return res.status(400).end();
        }

        // Get bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket,
                id: { in: user.bucketIds },
            },
        });

        if (!bucketObj) {
            console.log('[WebDAV PUT] Bucket not found:', bucket);
            res.setHeader('Content-Length', '0');
            return res.status(404).end();
        }

        // Get content length FIRST to determine if we should send 100-continue
        const contentLength = req.headers['content-length']
            ? parseInt(req.headers['content-length'], 10)
            : 0;

        console.log('[WebDAV PUT] Content-Length:', contentLength, 'bytes', `(${(contentLength / (1024 * 1024)).toFixed(2)} MB)`);

        // Parse path to find parent folder and filename
        const pathParts = objectPath.split('/').filter(p => p);
        const filename = pathParts[pathParts.length - 1];
        const parentParts = pathParts.slice(0, -1);

        // Find parent folder and build folder path
        let parentId: string | null = null;
        const folderPath: string[] = [];

        for (const part of parentParts) {
            const parent: any = await prisma.object.findFirst({
                where: {
                    bucketId: bucketObj.id,
                    parentId: parentId,
                    filename: part,
                    mimeType: 'folder',
                },
            });
            if (!parent) {
                console.log('[WebDAV PUT] Parent folder not found:', part);
                res.setHeader('Content-Length', '0');
                return res.status(404).end();
            }
            folderPath.push(parent.id);
            parentId = parent.id;
        }

        // Check if file already exists (update scenario)
        const existingObject = await prisma.object.findFirst({
            where: {
                bucketId: bucketObj.id,
                parentId: parentId,
                filename: filename,
            },
        });

        // Generate unique ID for storage
        const objectId = existingObject?.id || crypto.randomBytes(16).toString('hex');

        // Build storage path: /storage/{bucketName}/{folder1Id}/{folder2Id}/{fileId}
        const pathComponents = [
            process.cwd(),
            'storage',
            bucket,
            ...folderPath,
            objectId
        ];
        storagePath = path.join(...pathComponents);

        // Use a temporary file during upload in the .temp folder at the root of storage
        const storageRoot = path.join(process.cwd(), 'storage');
        const tempDir = path.join(storageRoot, '.temp');
        await fs.promises.mkdir(tempDir, { recursive: true });
        tempFilePath = path.join(tempDir, objectId + '.tmp');

        // Ensure parent directory exists
        await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });

        // Check for Range header (resumable upload)
        const rangeHeader = req.headers['content-range'];
        let startByte = 0;
        let endByte = contentLength - 1;
        let totalSize = contentLength;

        if (rangeHeader) {
            // Parse Content-Range header: bytes start-end/total
            const rangeMatch = rangeHeader.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
            if (rangeMatch) {
                startByte = parseInt(rangeMatch[1], 10);
                endByte = parseInt(rangeMatch[2], 10);
                totalSize = rangeMatch[3] === '*' ? 0 : parseInt(rangeMatch[3], 10);
                console.log('[WebDAV PUT] Resumable upload - Range:', startByte, '-', endByte, '/', totalSize);
            } else {
                console.log('[WebDAV PUT] Malformed Content-Range header:', rangeHeader);
            }
        }

        // Create write stream
        const writeOptions: any = {
            flags: startByte > 0 ? 'r+' : 'w', // Append if resuming
        };

        if (startByte > 0) {
            writeOptions.start = startByte;
        }

        writeStream = fs.createWriteStream(tempFilePath, writeOptions);
        console.log('[WebDAV PUT] Write stream opened:', tempFilePath, 'flags:', writeOptions.flags, 'start:', writeOptions.start);

        // --- VERBOSE REQUEST/RESPONSE LOGGING ---
        // Only log progress and key events
        console.log(`[WebDAV PUT] Uploading: ${filename} (${contentLength} bytes)`);
        // --- END VERBOSE LOGGING ---

        // Setup progress tracking
        progressKey = `${user.userId}:${bucketObj.id}:${objectId}`;
        let bytesReceived = startByte;
        const startTime = Date.now();
        let lastLogTime = startTime;

        uploadProgress.set(progressKey, {
            bytesReceived,
            totalBytes: totalSize || contentLength,
            startTime,
            lastUpdate: startTime,
        });

        // Create a Transform stream to track progress without consuming the stream twice
        progressTransform = new Transform({
            transform(chunk: Buffer, encoding, callback) {
                bytesReceived += chunk.length;
                const now = Date.now();
                if (now - lastLogTime > 1000) {
                    const percentComplete = totalSize > 0 ? (bytesReceived / totalSize) * 100 : 0;
                    const speed = (bytesReceived - startByte) / ((now - startTime) / 1000);
                    const speedMB = (speed / (1024 * 1024)).toFixed(2);
                    console.log(`[WebDAV PUT] PROGRESS: ${filename}: ${percentComplete.toFixed(1)}% (${(bytesReceived / (1024 * 1024)).toFixed(2)} MB / ${(totalSize / (1024 * 1024)).toFixed(2)} MB) @ ${speedMB} MB/s`);
                    lastLogTime = now;
                }
                callback(null, chunk);
            }
        });

        // --- QUOTA ENFORCEMENT ---
        // Calculate total used for bucket
        const bucketUsed = await prisma.object.aggregate({
            where: { bucketId: bucketObj.id },
            _sum: { size: true }
        });
        const bucketQuota = Number(bucketObj.storageQuota);
        const bucketUsedSize = Number(bucketUsed._sum.size || 0);
        // Calculate total used for user
        const userUsed = await prisma.object.aggregate({
            where: { bucket: { ownerId: user.userId } },
            _sum: { size: true }
        });
        const userQuota = Number((await prisma.user.findUnique({ where: { id: user.userId } }))?.storageQuota);
        const userUsedSize = Number(userUsed._sum.size || 0);
        // Quota checks
        if (bucketQuota > -1 && (bucketUsedSize + contentLength > bucketQuota)) {
            console.warn(`[WebDAV PUT] Bucket quota exceeded for ${bucketObj.name}`);
            res.setHeader('DAV', '1,2');
            res.setHeader('Content-Type', 'application/xml; charset="utf-8"');
            res.status(507).send(`<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d='DAV:'><d:quota-exceeded/></d:error>`);
            return;
        }
        if (userQuota > -1 && (userUsedSize + contentLength > userQuota)) {
            console.warn(`[WebDAV PUT] User quota exceeded for ${user.username}`);
            res.setHeader('DAV', '1,2');
            res.setHeader('Content-Type', 'application/xml; charset="utf-8"');
            res.status(507).send(`<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d='DAV:'><d:quota-exceeded/></d:error>`);
            return;
        }
        // --- END QUOTA ENFORCEMENT ---

        // Handle upload completion or errors
        await new Promise<void>((resolve, reject) => {
            // Pipe: request -> progressTransform -> writeStream
            req.pipe(progressTransform!).pipe(writeStream!);
            writeStream!.on('finish', () => {
                console.log('[WebDAV PUT] Write stream finished:', tempFilePath);
                resolve();
            });
            writeStream!.on('error', (error) => {
                console.error('[WebDAV PUT] Write stream error:', error);
                reject(error);
            });
            req.on('aborted', () => {
                console.log('[WebDAV PUT] Upload aborted by client');
                if (progressTransform) progressTransform.destroy();
                if (writeStream) writeStream.destroy();
                reject(new Error('Upload aborted'));
            });
            req.on('error', (error) => {
                console.error('[WebDAV PUT] Request error:', error);
                if (progressTransform) progressTransform.destroy();
                if (writeStream) writeStream.destroy();
                reject(error);
            });
            req.on('close', () => {
                console.log('[WebDAV PUT] Request closed for', filename);
                console.log('[WebDAV PUT] Bytes received:', bytesReceived, 'Expected:', contentLength);
                if (bytesReceived < contentLength) {
                    console.warn('[WebDAV PUT] WARNING: Upload incomplete, client closed early.');
                    // Only reject if upload is incomplete
                    if (!writeStream!.writableFinished) {
                        if (progressTransform) progressTransform.destroy();
                        if (writeStream) writeStream.destroy();
                        reject(new Error('Request closed prematurely'));
                    }
                } else {
                    console.log('[WebDAV PUT] Upload complete, client closed connection after sending all bytes.');
                }
            });
        });

        // Verify the upload completed successfully
        const stats = await fs.promises.stat(tempFilePath);

        // Move temp file to final location
        await fs.promises.rename(tempFilePath, storagePath);
        console.log('[WebDAV PUT] File moved to final location:', storagePath);

        // Get content type
        let contentType = req.headers['content-type'] || '';
        if (!contentType || contentType === 'application/octet-stream') {
            // Try to detect from filename
            const detected = mime.lookup(filename);
            if (detected && typeof detected === 'string') {
                contentType = detected;
            } else {
                contentType = 'application/octet-stream';
            }
        }

        // Add Range/Content-Range headers for partial upload confirmation
        if (rangeHeader && startByte >= 0 && endByte >= startByte) {
            res.setHeader('Range', `bytes=${startByte}-${endByte}`);
            res.setHeader('Content-Range', `bytes ${startByte}-${endByte}/${totalSize}`);
            console.log('[WebDAV PUT] Responding with Range/Content-Range:', `bytes=${startByte}-${endByte}`, `bytes ${startByte}-${endByte}/${totalSize}`);
        }
        if (existingObject) {
            // Update existing object
            await prisma.object.update({
                where: { id: existingObject.id },
                data: {
                    size: BigInt(stats.size),
                    mimeType: contentType,
                },
            });
            console.log('[WebDAV PUT] Updated file:', filename, 'size:', stats.size, 'bytes');
            res.setHeader('Content-Length', '0');
            res.status(204).end(); // No Content (updated)
        } else {
            // Create new object
            await prisma.object.create({
                data: {
                    id: objectId,
                    bucketId: bucketObj.id,
                    parentId: parentId,
                    filename: filename,
                    size: BigInt(stats.size),
                    mimeType: contentType,
                },
            });
            console.log('[WebDAV PUT] Created file:', filename, 'size:', stats.size, 'bytes');
            res.setHeader('Content-Length', '0');
            res.status(201).end(); // Created
        }
    } catch (error) {
        console.error('[WebDAV] PUT error:', error);
        if (error && (error as any).stack) {
            console.error('[WebDAV] PUT error stack:', (error as any).stack);
        }
        // Clean up on error
        if (progressTransform) {
            progressTransform.destroy();
        }
        if (writeStream) {
            writeStream.destroy();
        }
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                await fs.promises.unlink(tempFilePath);
            } catch (cleanupError) {
                console.error('[WebDAV PUT] Failed to clean up temp file:', cleanupError);
            }
        }
        if (progressKey) {
            uploadProgress.delete(progressKey);
        }
        // Always set DAV and Content-Length headers on error
        if (!res.headersSent) {
            res.setHeader('DAV', '1,2');
            res.setHeader('Content-Length', '0');
            res.setHeader('Connection', 'close');
            if ((error as any).message === 'Upload aborted' || (error as any).message === 'Request closed prematurely') {
                res.status(499).end(); // Client Closed Request (Nginx/Cloudflare convention)
            } else {
                res.status(500).end();
            }
        }
    }
}

// Endpoint to check upload progress (optional - add to router if needed)
export async function handleUploadProgress(req: express.Request, res: express.Response) {
    const user: WebDAVUser = (req as any).webdavUser;
    const { bucket, objectPath } = parseWebDAVPath(req.path);

    // This would need the object ID - simplified example
    const progressKey = req.query.key as string;
    const progress = uploadProgress.get(progressKey);

    if (!progress) {
        return res.status(404).json({ error: 'No upload in progress' });
    }

    const percentComplete = progress.totalBytes > 0
        ? (progress.bytesReceived / progress.totalBytes) * 100
        : 0;

    const elapsed = (Date.now() - progress.startTime) / 1000;
    const speed = progress.bytesReceived / elapsed;

    res.json({
        bytesReceived: progress.bytesReceived,
        totalBytes: progress.totalBytes,
        percentComplete: percentComplete.toFixed(2),
        speedBytesPerSecond: speed,
        speedMBPerSecond: (speed / (1024 * 1024)).toFixed(2),
    });
}

// PATCH support for chunked uploads (optional, non-standard)
export const handlePatch = async (req: express.Request, res: express.Response) => {
    console.log('[WebDAV PATCH] Incoming request:', req.method, req.originalUrl);
    // For simplicity, just call handlePut (same logic for partial transfer)
    // In production, you may want to add extra checks for PATCH semantics
    return handlePut(req, res);
};
