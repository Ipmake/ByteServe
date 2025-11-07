import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import { updateStatsInRedis } from '../../../../common/stats';
import fsPromises from 'fs/promises';
import fs from 'fs';

export default function S3Handlers_GetObject(router: express.Router) {
    router.get('/:bucket{/*objectPath}', async (req: express.Request, res) => {
        try {
            const { bucket } = req.params;
            const objectPathParam = (req.params as any).objectPath || [];
            const objectPath = Array.isArray(objectPathParam) ? objectPathParam.filter(segment => segment !== '') : [];

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
                },
                include: {
                    BucketConfig: true
                }
            });

            if (!bucketObj) {
                return res.status(404).send('Bucket not found');
            }

            if (bucketObj.access === 'private') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) {
                    return res.status(401).send('Unauthorized');
                }

                const credentialsInDb = await prisma.s3Credential.findUnique({
                    where: {
                        accessKey: accessKeyId,
                        bucketAccess: {
                            some: { bucketId: bucketObj.id }
                        }
                    },
                    include: {
                        user: true
                    }
                });
                if (!credentialsInDb) {
                    return res.status(401).send('Unauthorized');
                }

                const result = S3SigV4Auth.verifyWithPathDetection(
                    req.method,
                    req.originalUrl,
                    req.path,
                    req.headers,
                    req.method === 'PUT' || req.method === 'POST' ? req.body : undefined,
                    accessKeyId,
                    credentialsInDb.secretKey
                );

                if (!result.isValid) {
                    return res.status(403).send('Invalid signature');
                }
            }

            const pathSegments = objectPath.filter((p: string) => p);

            const object = await resolvePath(bucketObj.name, pathSegments, {
                enabled: bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_enable')?.value === 'true',
                ttl: parseInt(bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_ttl_seconds')?.value || '300', 10),
            });

            if (!object) {
                return res.status(404).send('Object not found');
            }

            const physicalPath = getObjectPath(bucketObj.name, object.id);

            const range = req.headers.range;
            const totalSize = Number(object.size);

            let start = 0;
            let end = totalSize - 1;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                start = parseInt(parts[0], 10);
                end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

                // Validate range
                if (start >= totalSize || end >= totalSize || start > end) {
                    res.status(416).send('Requested range not satisfiable');
                    return;
                }

                res.status(206).set({
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': (end - start + 1),
                    'Content-Type': object.mimeType,
                    'Content-Disposition': `inline; filename="${object.filename}"`
                });
            } else {
                res.status(200).set({
                    'Content-Length': totalSize,
                    'Content-Type': object.mimeType,
                    'Content-Disposition': `inline; filename="${object.filename}"`,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-cache'
                });
            }

            // Optimize socket for high-throughput
            if (res.socket) {
                res.socket.setKeepAlive(true, 60000);
                res.socket.setNoDelay(true);

                // Increase socket buffer sizes for high-throughput (16MB based on benchmark results)
                try {
                    // @ts-ignore - these methods exist but aren't in the types
                    if (res.socket.setRecvBufferSize) res.socket.setRecvBufferSize(16 * 1024 * 1024);
                    // @ts-ignore
                    if (res.socket.setSendBufferSize) res.socket.setSendBufferSize(16 * 1024 * 1024);
                } catch (e) {
                    // Ignore if not supported
                }
            }

            const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB chunks - optimal for high-latency connections

            const stream = fs.createReadStream(physicalPath, { start, end, highWaterMark: CHUNK_SIZE });

            stream.pipe(res);

            await new Promise<void>((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });

            await updateStatsInRedis(bucketObj.id, {
                requestsCount: 1,
                s3RequestsServed: 1,
                bytesServed: Number(object.size)
            });

            return;
        } catch (err: any) {
            console.error('Error in GetObject handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}