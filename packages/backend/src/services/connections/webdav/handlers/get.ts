import express from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';

export async function handleGet(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        console.log('[WebDAV GET] Requesting bucket:', bucket, 'path:', objectPath);
        
        if (!bucket || objectPath === '/') {
            return res.status(404).send('Not Found');
        }
        
        // Get bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket,
                id: { in: user.bucketIds },
            },
        });
        
        if (!bucketObj) {
            return res.status(404).send('Not Found');
        }
        
        // Find object by traversing path
        const pathParts = objectPath.split('/').filter(p => p);
        let currentParentId: string | null = null;
        let targetObject: any = null;
        const folderPath: string[] = []; // Track folder IDs for building storage path
        
        for (const part of pathParts) {
            targetObject = await prisma.object.findFirst({
                where: {
                    bucketId: bucketObj.id,
                    parentId: currentParentId,
                    filename: part,
                },
            });
            
            if (!targetObject) {
                return res.status(404).send('Not Found');
            }
            
            if (targetObject.mimeType === 'folder') {
                folderPath.push(targetObject.id);
            }
            
            currentParentId = targetObject.id;
        }
        
        if (!targetObject || targetObject.mimeType === 'folder') {
            console.log('[WebDAV GET] Object not found or is folder');
            return res.status(404).send('Not Found');
        }
        
        // Try new structure first: /storage/{bucketName}/{folder1Id}/{folder2Id}/{fileId}
        let storagePath = path.join(
            process.cwd(),
            'storage',
            bucket,
            ...folderPath,
            targetObject.id
        );
        
        // If file doesn't exist in new structure, try legacy structure: /storage/{bucketName}/{fileId}
        if (!fs.existsSync(storagePath)) {
            console.log('[WebDAV GET] File not in nested structure, trying legacy path');
            storagePath = path.join(process.cwd(), 'storage', bucket, targetObject.id);
        }
        
        if (!fs.existsSync(storagePath)) {
            console.log('[WebDAV GET] File not found in storage');
            return res.status(404).send('File not found in storage');
        }
        
        // Get file stats
        const stats = await fs.promises.stat(storagePath);
        const fileSize = stats.size;
        
        // Parse Range header for partial content requests
        const rangeHeader = req.headers.range;
        
        if (rangeHeader) {
            // Parse Range header: bytes=start-end
            const parts = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            // Validate range
            if (start >= fileSize || end >= fileSize || start > end) {
                res.setHeader('Content-Range', `bytes */${fileSize}`);
                return res.status(416).send('Requested Range Not Satisfiable');
            }
            
            const chunkSize = (end - start) + 1;
            
            console.log(`[WebDAV GET] Streaming range ${start}-${end}/${fileSize} (${chunkSize} bytes)`);
            
            // Set headers for partial content
            res.status(206); // Partial Content
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunkSize);
            res.setHeader('Content-Type', targetObject.mimeType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // Create read stream for the specified range
            const fileStream = fs.createReadStream(storagePath, { start, end });
            
            // Track progress for large files
            let bytesStreamed = 0;
            const startTime = Date.now();
            
            fileStream.on('data', (chunk: string | Buffer) => {
                bytesStreamed += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
                
                // Log progress for large chunks (> 10MB)
                if (chunkSize > 10 * 1024 * 1024 && bytesStreamed % (5 * 1024 * 1024) === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = bytesStreamed / elapsed;
                    console.log(
                        `[WebDAV GET] Streamed ${(bytesStreamed / (1024 * 1024)).toFixed(2)} MB ` +
                        `@ ${(speed / (1024 * 1024)).toFixed(2)} MB/s`
                    );
                }
            });
            
            fileStream.on('error', (error) => {
                console.error('[WebDAV GET] Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Stream error');
                }
            });
            
            fileStream.pipe(res);
            
        } else {
            // No range header, send entire file
            console.log('[WebDAV GET] Streaming entire file:', storagePath, `(${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
            
            res.setHeader('Content-Type', targetObject.mimeType);
            res.setHeader('Content-Length', fileSize.toString());
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // Track progress for large files
            let bytesStreamed = 0;
            const startTime = Date.now();
            const fileStream = fs.createReadStream(storagePath);
            
            fileStream.on('data', (chunk: string | Buffer) => {
                bytesStreamed += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
                
                // Log progress every 10MB for large files
                if (fileSize > 10 * 1024 * 1024 && bytesStreamed % (10 * 1024 * 1024) === 0) {
                    const percentComplete = (bytesStreamed / fileSize) * 100;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = bytesStreamed / elapsed;
                    console.log(
                        `[WebDAV GET] ${targetObject.filename}: ${percentComplete.toFixed(1)}% ` +
                        `(${(bytesStreamed / (1024 * 1024)).toFixed(2)} MB / ` +
                        `${(fileSize / (1024 * 1024)).toFixed(2)} MB) @ ${(speed / (1024 * 1024)).toFixed(2)} MB/s`
                    );
                }
            });
            
            fileStream.on('error', (error) => {
                console.error('[WebDAV GET] Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Stream error');
                }
            });
            
            fileStream.pipe(res);
        }
    } catch (error) {
        console.error('[WebDAV] GET error:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
        }
    }
}

export async function handleHead(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        if (!bucket || objectPath === '/') {
            return res.status(404).send('Not Found');
        }
        
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket,
                id: { in: user.bucketIds },
            },
        });
        
        if (!bucketObj) {
            return res.status(404).end();
        }
        
        const pathParts = objectPath.split('/').filter(p => p);
        let currentParentId: string | null = null;
        let targetObject: any = null;
        
        for (const part of pathParts) {
            targetObject = await prisma.object.findFirst({
                where: {
                    bucketId: bucketObj.id,
                    parentId: currentParentId,
                    filename: part,
                },
            });
            
            if (!targetObject) {
                return res.status(404).end();
            }
            
            currentParentId = targetObject.id;
        }
        
        if (!targetObject) {
            return res.status(404).end();
        }
        
        res.setHeader('Content-Type', targetObject.mimeType);
        res.setHeader('Content-Length', targetObject.size.toString());
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(200).end();
    } catch (error) {
        console.error('[WebDAV] HEAD error:', error);
        res.status(500).end();
    }
}
