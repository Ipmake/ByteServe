import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import fs from 'fs/promises';

export default function S3Handlers_DeleteObject(router: express.Router) {
    router.delete('/:bucket{/*objectPath}', async (req, res) => {
        try {
            const { bucket } = req.params;
            const objectPathParam = (req.params as any).objectPath || [];
            const objectPath = Array.isArray(objectPathParam) ? objectPathParam.join('/') : objectPathParam;

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
                return res.status(404).json({
                    message: 'Bucket not found'
                });
            }

            if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) {
                    return res.status(401).json({ message: 'Unauthorized' });
                }

                const credentialsInDb = await prisma.s3Credential.findUnique({
                    where: {
                        accessKey: accessKeyId,
                        bucketAccess: { some: { bucketId: bucketObj.id } }
                    },
                    include: {
                        user: true
                    }
                });
                if (!credentialsInDb) {
                    return res.status(401).json({ message: 'Unauthorized' });
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
                    return res.status(403).json({ message: 'Invalid signature' });
                }
            }

            const pathSegments = objectPath.split('/').filter((p: string) => p);

            const object = await resolvePath(bucketObj.name, pathSegments);

            if (!object) {
                return res.status(404).json({ message: 'Object not found' });
            }

            await prisma.object.delete({
                where: {
                    id: object.id
                }
            });

            if (bucketObj.BucketConfig.find(c => c.key === 's3_clear_empty_parents')?.value === 'true' && object.parentId) {
                const { _count } = await prisma.object.aggregate({
                    where: {
                        parentId: object.parentId,
                        bucketId: bucketObj.id
                    },
                    _count: {
                        id: true
                    }
                });

                if (_count.id === 0) {
                    console.log('Deleting empty parent folder:', object.parentId);
                    await prisma.object.delete({
                        where: {
                            id: object.parentId
                        }
                    });
                }
            }

            await fs.unlink(getObjectPath(bucketObj.name, object.id)).catch(() => { });

            return res.status(204).send();
        } catch (err: any) {
            console.error('Error in DeleteObject handler:', err);
            return res.status(500).json({ message: `Internal server error: ${err?.message || err}` });
        }
    });
}