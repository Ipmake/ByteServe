import express from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';

export async function handleMove(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        if (!bucket || objectPath === '/') {
            return res.status(403).send('Cannot move root or bucket');
        }
        
        // Get destination from Destination header
        const destinationHeader = req.headers.destination as string;
        if (!destinationHeader) {
            return res.status(400).send('Destination header required');
        }
        
        // Parse destination (remove protocol and host if present)
        let destination = destinationHeader;
        const urlMatch = destination.match(/https?:\/\/[^/]+(.+)/);
        if (urlMatch) {
            destination = urlMatch[1];
        }
        
        const { bucket: destBucket, objectPath: destObjectPath } = parseWebDAVPath(destination);
        
        if (destBucket !== bucket) {
            return res.status(403).send('Cannot move across buckets');
        }
        
        if (!destObjectPath || destObjectPath === '/') {
            return res.status(400).send('Invalid destination');
        }
        
        // Find the bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket,
                id: { in: user.bucketIds },
            },
        });
        
        if (!bucketObj) {
            return res.status(404).send('Bucket not found');
        }
        
        // Find source object
        const pathParts = objectPath.split('/').filter(p => p);
        let currentParentId: string | null = null;
        let sourceObject: any = null;
        
        for (const part of pathParts) {
            sourceObject = await prisma.object.findFirst({
                where: {
                    bucketId: bucketObj.id,
                    parentId: currentParentId,
                    filename: part,
                },
            });
            
            if (!sourceObject) {
                return res.status(404).send('Source not found');
            }
            
            currentParentId = sourceObject.id;
        }
        
        // Find destination parent and new filename
        const destParts = destObjectPath.split('/').filter(p => p);
        const newFilename = destParts.pop()!;
        let destParentId: string | null = null;
        
        for (const part of destParts) {
            const parentObj: any = await prisma.object.findFirst({
                where: {
                    bucketId: bucketObj.id,
                    parentId: destParentId,
                    filename: part,
                },
            });
            
            if (!parentObj) {
                return res.status(404).send('Destination parent not found');
            }
            
            destParentId = parentObj.id;
        }
        
        // Check if destination already exists
        const overwrite = req.headers.overwrite !== 'F';
        const existingDest = await prisma.object.findFirst({
            where: {
                bucketId: bucketObj.id,
                parentId: destParentId,
                filename: newFilename,
            },
        });
        
        if (existingDest && !overwrite) {
            return res.status(412).send('Destination exists and overwrite is false');
        }
        
        // Build old and new storage paths
        const cwd = process.cwd();
        
        // Build source path
        let sourceFolderPath: string[] = [];
        let tempParentId = sourceObject.parentId;
        while (tempParentId) {
            const parentObj = await prisma.object.findUnique({
                where: { id: tempParentId },
            });
            if (parentObj) {
                sourceFolderPath.unshift(parentObj.id);
                tempParentId = parentObj.parentId;
            } else {
                break;
            }
        }
        
        const oldStoragePath = path.join(cwd, 'storage', bucket, ...sourceFolderPath, sourceObject.id);
        
        // Build destination path
        let destFolderPath: string[] = [];
        tempParentId = destParentId;
        while (tempParentId) {
            const parentObj = await prisma.object.findUnique({
                where: { id: tempParentId },
            });
            if (parentObj) {
                destFolderPath.unshift(parentObj.id);
                tempParentId = parentObj.parentId;
            } else {
                break;
            }
        }
        
        const newStoragePath = path.join(cwd, 'storage', bucket, ...destFolderPath, sourceObject.id);
        
        // Delete existing destination if overwrite is true
        if (existingDest) {
            const existingPath = path.join(cwd, 'storage', bucket, ...destFolderPath, existingDest.id);
            if (fs.existsSync(existingPath)) {
                if (existingDest.mimeType === 'folder') {
                    fs.rmSync(existingPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(existingPath);
                }
            }
            await prisma.object.delete({
                where: { id: existingDest.id },
            });
        }
        
        // Create destination parent directory if needed
        const newStorageDir = path.dirname(newStoragePath);
        if (!fs.existsSync(newStorageDir)) {
            fs.mkdirSync(newStorageDir, { recursive: true });
        }
        
        // Move the physical file/folder
        if (fs.existsSync(oldStoragePath)) {
            fs.renameSync(oldStoragePath, newStoragePath);
        }
        
        // Update database
        await prisma.object.update({
            where: { id: sourceObject.id },
            data: {
                filename: newFilename,
                parentId: destParentId,
                // Update mimeType if not a folder
                ...(sourceObject.mimeType !== 'folder' ? {
                    mimeType: require('mime-types').lookup(newFilename) || 'application/octet-stream'
                } : {})
            },
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
        // Quota checks (for move, use sourceObject.size)
        if (bucketQuota > -1 && (bucketUsedSize + Number(sourceObject.size) > bucketQuota)) {
            res.setHeader('DAV', '1,2');
            res.setHeader('Content-Type', 'application/xml; charset="utf-8"');
            res.status(507).send(`<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d='DAV:'><d:quota-exceeded/></d:error>`);
            return;
        }
        if (userQuota > -1 && (userUsedSize + Number(sourceObject.size) > userQuota)) {
            res.setHeader('DAV', '1,2');
            res.setHeader('Content-Type', 'application/xml; charset="utf-8"');
            res.status(507).send(`<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d='DAV:'><d:quota-exceeded/></d:error>`);
            return;
        }
        // --- END QUOTA ENFORCEMENT ---
        
        console.log('[WebDAV MOVE] Moved:', objectPath, '->', destObjectPath);
        res.status(existingDest ? 204 : 201).end();
    } catch (error) {
        console.error('[WebDAV] MOVE error:', error);
        res.status(500).send('Internal Server Error');
    }
}
