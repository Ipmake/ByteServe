import express from 'express';
import { prisma } from '../..';
import { WebDAVUser } from '../types';
import { parseWebDAVPath, generatePropfindXML, encodeWebDAVPath } from '../utils';

export async function handlePropfind(req: express.Request, res: express.Response) {
    try {
        const user: WebDAVUser = (req as any).webdavUser;
        const { bucket, objectPath } = parseWebDAVPath(req.path);
        
        console.log('[WebDAV PROPFIND] Incoming path:', req.path, '-> bucket:', bucket, 'objectPath:', objectPath);
        
        // List buckets at root level
        if (!bucket) {
            const buckets = await prisma.bucket.findMany({
                where: {
                    id: { in: user.bucketIds },
                },
            });
            
            // Include the root directory itself in the response
            const items = [
                {
                    href: '/dav/',
                    name: '/',
                    isDirectory: true,
                    modified: new Date().toUTCString(),
                    size: 0,
                },
                ...buckets.map(b => ({
                    href: encodeWebDAVPath(`/dav/${b.name}/`),
                    name: b.name,
                    isDirectory: true,
                    modified: b.createdAt.toUTCString(),
                    size: 0,
                }))
            ];
            
            const xmlResponse = generatePropfindXML(items, '/dav/');
            
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.status(207).send(xmlResponse);
            return;
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
        
        // List objects in bucket
        if (objectPath === '/') {
            const objects = await prisma.object.findMany({
                where: {
                    bucketId: bucketObj.id,
                    parentId: null,
                },
            });
            
            const items = [
                {
                    href: encodeWebDAVPath(`/dav/${bucket}/`),
                    name: bucket,
                    isDirectory: true,
                    modified: bucketObj.createdAt.toUTCString(),
                    size: 0,
                },
                ...objects.map(obj => ({
                    href: encodeWebDAVPath(`/dav/${bucket}/${obj.filename}${obj.mimeType === 'folder' ? '/' : ''}`),
                    name: obj.filename,
                    isDirectory: obj.mimeType === 'folder',
                    modified: obj.createdAt.toUTCString(),
                    size: Number(obj.size),
                    contentType: obj.mimeType !== 'folder' ? obj.mimeType : undefined,
                }))
            ];
            
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.status(207).send(generatePropfindXML(items, `/dav/${bucket}/`));
            return;
        }
        
        // Find specific object
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
                return res.status(404).send('Not Found');
            }
            
            currentParentId = targetObject.id;
        }
        
        if (!targetObject) {
            return res.status(404).send('Not Found');
        }
        
        // If it's a folder, list its contents
        if (targetObject.mimeType === 'folder') {
            const children = await prisma.object.findMany({
                where: {
                    bucketId: bucketObj.id,
                    parentId: targetObject.id,
                },
            });
            
            const currentPath = `/dav/${bucket}${objectPath}`;
            const encodedCurrentPath = encodeWebDAVPath(currentPath);
            const items = [
                {
                    href: encodedCurrentPath.endsWith('/') ? encodedCurrentPath : `${encodedCurrentPath}/`,
                    name: targetObject.filename,
                    isDirectory: true,
                    modified: targetObject.createdAt.toUTCString(),
                    size: 0,
                },
                ...children.map(obj => ({
                    href: encodeWebDAVPath(`${currentPath}${currentPath.endsWith('/') ? '' : '/'}${obj.filename}${obj.mimeType === 'folder' ? '/' : ''}`),
                    name: obj.filename,
                    isDirectory: obj.mimeType === 'folder',
                    modified: obj.createdAt.toUTCString(),
                    size: Number(obj.size),
                    contentType: obj.mimeType !== 'folder' ? obj.mimeType : undefined,
                }))
            ];
            
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.status(207).send(generatePropfindXML(items, currentPath.endsWith('/') ? currentPath : `${currentPath}/`));
        } else {
            // Single file
            const items = [{
                href: encodeWebDAVPath(`/dav/${bucket}${objectPath}`),
                name: targetObject.filename,
                isDirectory: false,
                modified: targetObject.createdAt.toUTCString(),
                size: Number(targetObject.size),
                contentType: targetObject.mimeType,
            }];
            
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.status(207).send(generatePropfindXML(items, `/dav/${bucket}${objectPath}`));
        }
    } catch (error) {
        console.error('[WebDAV] PROPFIND error:', error);
        res.status(500).send('Internal Server Error');
    }
}
