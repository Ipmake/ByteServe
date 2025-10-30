import express from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../../fork';
import { WebDAVUser } from '../types';
import { parseWebDAVPath } from '../utils';

export async function handleDelete(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);

        if (!bucket || objectPath === '/') {
            return res.status(403).send('Cannot delete root or bucket');
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

        // Find object to delete
        const pathParts = objectPath.split('/').filter(p => p);
        let currentParentId: string | null = null;
        let targetObject: any = null;
        const folderPath: string[] = [];

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

            // Track parent folders for building storage path
            if (targetObject.mimeType !== 'folder' || part !== pathParts[pathParts.length - 1]) {
                if (currentParentId) {
                    folderPath.push(currentParentId);
                }
            }

            currentParentId = targetObject.id;
        }

        // Build storage path
        const storagePath = path.join(
            process.cwd(),
            'storage',
            bucket,
            targetObject.id
        );

        // Delete physical file/folder
        if (fs.existsSync(storagePath)) {
            if (targetObject.mimeType === 'folder') {
                // Folders are virtual, directory doesn't exist. Children will be deleted by scheduled task.
            } else {
                // Delete file
                fs.unlinkSync(storagePath);
            }
        }

        // Delete the object itself from database
        await prisma.object.delete({
            where: { id: targetObject.id },
        });

        console.log('[WebDAV DELETE] Deleted:', objectPath);
        res.status(204).end();
    } catch (error) {
        console.error('[WebDAV] DELETE error:', error);
        res.status(500).send('Internal Server Error');
    }
}
