import { Prisma, PrismaClient } from "@prisma/client";
import express from "express";
import { createClient as createRedisClient } from "redis";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

const prisma = new PrismaClient({});
const redis = createRedisClient({
    url: process.env.REDIS_CONNECTION_STRING
});

class WorkerTools {
    public static async resolvePath(bucketName: string, pathSegments: string[], caching: {
        enabled: boolean;
        ttl: number;
    } = {
            enabled: false,
            ttl: 300,
        }): Promise<Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null> {

        if (caching?.enabled) {
            const pathHash = crypto.createHash('md5').update(`${bucketName}:${pathSegments.join('/')}`).digest('hex');
            const data = await redis.json.get(`object-path-cache:${pathHash}`) as Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null;
            if (data) return {
                ...data,
                size: BigInt(data.size),
                bucket: {
                    ...data.bucket,
                    storageQuota: BigInt(data.bucket.storageQuota),
                }
            };
        }

        let currentParentId: string | null = null;
        let result: Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null = null;

        for (const segment of pathSegments) {
            const foundObject: Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null = await prisma.object.findFirst({
                where: {
                    bucket: { name: bucketName },
                    filename: segment,
                    parentId: currentParentId,
                },
                include: { bucket: true },
            });

            if (!foundObject) return null;

            result = foundObject;
            if (foundObject.mimeType === 'folder') currentParentId = foundObject.id;
        }

        if (caching?.enabled && result) {
            const pathHash = crypto.createHash('md5').update(`${bucketName}:${pathSegments.join('/')}`).digest('hex');
            const res = await Promise.all([
                redis.json.set(`object-path-cache:${pathHash}`, '$', {
                    ...result,
                    size: Number(result.size),
                    bucket: {
                        ...result.bucket,
                        storageQuota: Number(result.bucket.storageQuota),
                    }
                }),
                redis.expire(`object-path-cache:${pathHash}`, caching.ttl)
            ])
        }

        return result;
    }

    public static getObjectPath(bucketName: string, objectId: string): string {
        return path.join(process.cwd(), 'storage', bucketName, objectId);
    }

    public static getStorageDir(): string {
        return path.join(process.cwd(), 'storage');
    }

    public static async ensureWorkerReady(): Promise<void> {
        if (!redis.isOpen) {
            await redis.connect();
        }
    }
}


class FileRequestWorker {

}

class StorageWorker {
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

            // Check if file exists
            try {
                await fs.access(physicalPath);
            } catch {
                return { status: 404, body: { error: 'File not found on disk' } };
            }

            // Set content type and send file

            const fileBuffer = await fs.readFile(physicalPath);
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

export const StorageWorker_PublicFileAccess = StorageWorker.PublicFileAccess;