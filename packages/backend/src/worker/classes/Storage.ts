import express from "express";
import { prisma } from "../worker";
import fs from "fs/promises";
import WorkerTools from "./WorkerTools";

export default class StorageWorker {
    public static async PublicFileAccess(req: express.Request): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();
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
                return { status: 404, body: { error: 'Bucket not found' } };
            }

            // Check if bucket is public
            if (bucket.access === 'private') {
                return { status: 403, body: { error: 'This bucket is private' } };
            }

            // If no path, list bucket root
            if (pathSegments.length === 0) {
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

                return {
                    status: 200,
                    body: {
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
                    }
                }
            }

            // Resolve path to object
            const object = await WorkerTools.resolvePath(bucketName, pathSegments, {
                enabled: bucket.BucketConfig.find(c => c.key === 'cache_path_caching_enable')?.value === 'true',
                ttl: parseInt(bucket.BucketConfig.find(c => c.key === 'cache_path_caching_ttl_seconds')?.value || '300', 10),
            });

            if (!object) {
                return { status: 404, body: { error: 'File or folder not found' } };
            }

            // If it's a folder, list contents
            if (object.mimeType === 'folder') {
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

                return {
                    status: 200,
                    body: {
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
                    }
                }
            }

            // It's a file - serve it
            const physicalPath = WorkerTools.getObjectPath(bucketName, object.id);

            // Set content type and send file
            const fileBuffer = await fs.readFile(physicalPath);

            await WorkerTools.updateStatsInRedis(bucket.id, {
                requestsCount: 1,
                bytesServed: fileBuffer.length,
                apiRequestsServed: 1,
            });

            return {
                status: 200,
                body: Buffer.from(fileBuffer),
                headers: {
                    'Content-Type': object.mimeType,
                    'Content-Disposition': `inline; filename="${object.filename}"`,
                }
            }
        } catch (error) {
            console.error('Error serving public file:', error);
            return { status: 500, body: { error: 'Failed to serve file' } };
        }
    }
}