import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';

export async function handleCopy(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        if (!bucket || objectPath === '/') {
            return res.status(403).send('Cannot copy root or bucket');
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
            return res.status(403).send('Cannot copy across buckets');
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
        // Quota checks (for copy, use sourceObject.size)
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
        
        // Build source storage path
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
        
        const sourceStoragePath = path.join(process.cwd(), 'storage', bucket, sourceObject.id);
        
        // Build destination storage path
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
        
        // Copy database object
        async function copyObject(srcObj: any, newParentId: string | null, newName: string) {
            const newObj = await prisma.object.create({
                data: {
                    bucketId: srcObj.bucketId,
                    parentId: newParentId,
                    filename: newName,
                    size: srcObj.size,
                    mimeType: srcObj.mimeType,
                },
                include: {
                    bucket: true,
                }
            });
            
            // If it's a folder, recursively copy children
            if (srcObj.mimeType === 'folder') {
                const children = await prisma.object.findMany({
                    where: { parentId: srcObj.id },
                });
                
                for (const child of children) {
                    const childId = crypto.randomBytes(16).toString('hex');
                    await copyObject(child, newObj.id, child.filename);
                }
            } else {
                // Copy file in storage
                await fs.copyFileSync(sourceStoragePath, path.join(process.cwd(), 'storage', newObj.bucket.name, newObj.id));
            }
        }

        await copyObject(sourceObject, destParentId, newFilename);

        console.log('[WebDAV COPY] Copied:', objectPath, '->', destObjectPath);
        res.status(existingDest ? 204 : 201).end();
    } catch (error) {
        console.error('[WebDAV] COPY error:', error);
        res.status(500).send('Internal Server Error');
    }
}
