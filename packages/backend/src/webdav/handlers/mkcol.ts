import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';

export async function handleMkcol(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        if (!bucket || objectPath === '/') {
            return res.status(400).send('Bad Request');
        }
        
        // Get bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket,
                id: { in: user.bucketIds },
            },
        });
        
        if (!bucketObj) {
            return res.status(404).send('Bucket not found');
        }
        
        // Parse path to find parent folder and new folder name
        const pathParts = objectPath.split('/').filter(p => p);
        const newFolderName = pathParts[pathParts.length - 1];
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
                return res.status(409).send('Parent folder not found');
            }
            
            folderPath.push(parent.id);
            parentId = parent.id;
        }
        
        // Check if folder already exists
        const existing = await prisma.object.findFirst({
            where: {
                bucketId: bucketObj.id,
                parentId: parentId,
                filename: newFolderName,
            },
        });
        
        if (existing) {
            return res.status(405).send('Method Not Allowed - Collection already exists');
        }
        
        // Create folder object
        const folderId = crypto.randomBytes(16).toString('hex');
        
        await prisma.object.create({
            data: {
                id: folderId,
                bucketId: bucketObj.id,
                parentId: parentId,
                filename: newFolderName,
                size: BigInt(0),
                mimeType: 'folder',
            },
        });
        
        // Create physical directory
        const storagePath = path.join(
            process.cwd(),
            'storage',
            bucket,
            ...folderPath,
            folderId
        );
        
        await fs.promises.mkdir(storagePath, { recursive: true });
        
        console.log('[WebDAV MKCOL] Created folder:', objectPath);
        res.status(201).end();
    } catch (error) {
        console.error('[WebDAV] MKCOL error:', error);
        res.status(500).send('Internal Server Error');
    }
}
