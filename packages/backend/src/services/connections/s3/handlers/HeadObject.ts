import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import fs from 'fs/promises';

export default function S3Handlers_HeadObject(router: express.Router) {
    router.head('/:bucket{/*objectPath}', async (req: express.Request, res) => {
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
                return res.status(404).end();
            }

            if (bucketObj.access === 'private') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) {
                    return res.status(401).end();
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
                    return res.status(401).end();
                }

                const result = S3SigV4Auth.verifyWithPathDetection(
                    req.method,
                    req.originalUrl,
                    req.path,
                    req.headers,
                    undefined,
                    accessKeyId,
                    credentialsInDb.secretKey
                );

                if (!result.isValid) {
                    return res.status(403).end();
                }
            }

            const pathSegments = objectPath.filter((p: string) => p);

            const object = await resolvePath(bucketObj.name, pathSegments, {
                enabled: bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_enable')?.value === 'true',
                ttl: parseInt(bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_ttl_seconds')?.value || '300', 10),
            });

            if (!object) {
                return res.status(404).end();
            }

            const physicalPath = getObjectPath(bucketObj.name, object.id);

            // Check if file exists
            try {
                await fs.access(physicalPath);
            } catch {
                return res.status(404).end();
            }

            const totalSize = Number(object.size);

            const range = req.headers.range;
            let start = 0;
            let end = totalSize - 1;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                start = parseInt(parts[0], 10);
                end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

                // Validate range
                if (start >= totalSize || end >= totalSize || start > end) {
                    res.status(416)
                        .set({
                            'Content-Range': `bytes */${totalSize}`,
                        })
                        .end();
                    return;
                }

                res.status(206).set({
                    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(end - start + 1),
                    'Content-Type': object.mimeType,
                    'Last-Modified': object.updatedAt.toUTCString(),
                    'ETag': `"${object.id}"`
                });
            } else {
                res.status(200).set({
                    'Content-Length': String(totalSize),
                    'Content-Type': object.mimeType,
                    'Accept-Ranges': 'bytes',
                    'Last-Modified': object.updatedAt.toUTCString(),
                    'ETag': `"${object.id}"`
                });
            }

            return res.end();
        } catch (err: any) {
            console.error('Error in HeadObject handler:', err);
            return res.status(500).end();
        }
    });
}
