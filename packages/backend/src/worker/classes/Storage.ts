import express from "express";
import { prisma } from "../worker";
import fs from "fs/promises";
import fssync from "fs";
import WorkerTools from "./WorkerTools";
import { MessagePortDuplex } from "../../common/stream";
import { MessagePort } from "worker_threads";
import { pipeline } from "stream";

export default class StorageWorker {
    public static async PublicFileAccess(data: {
        port: MessagePort;
        req: Worker.WorkerRequest;
    }): Promise<Worker.WorkerResponse> {
        const req: Worker.WorkerRequest = data.req;

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
                if(bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') return {
                    status: 403,
                    body: { error: 'May not list folder contents' }
                };
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
                if(bucket.BucketConfig.find(c => c.key === 'files_send_folder_index')?.value !== 'true') return {
                    status: 403,
                    body: { error: 'May not list folder contents' }
                };
                
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

            await WorkerTools.updateStatsInRedis(bucket.id, {
                requestsCount: 1,
                bytesServed: Number(object.size),
                apiRequestsServed: 1,
            });

            data.port.postMessage({
                type: 'metadata',
                contentLength: Number(object.size),
                mimeType: object.mimeType,
                filename: object.filename,
            })

            await new Promise<void>((resolve, reject) => {
                setImmediate(resolve);
            });

            await new Promise<void>((resolve, reject) => {
                const duplex = new MessagePortDuplex(data.port);

                pipeline(
                    fssync.createReadStream(physicalPath, { highWaterMark: 1024 * 1024 }),
                    duplex,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                )
            });

            return {
                status: 200,
                body: null,
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