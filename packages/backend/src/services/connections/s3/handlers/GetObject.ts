import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import { updateStatsInRedis } from '../../../../common/stats';

export default function S3Handlers_GetObject(router: express.Router) {
    router.get('/:bucket/{*objectPath}', async (req, res) => {
        try {
            const { bucket } = req.params;
            const objectPathParam = (req.params as any).objectPath || [];
            const objectPath = Array.isArray(objectPathParam) ? objectPathParam.join('/') : objectPathParam;

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
                },
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

            const pathSegments = objectPath.split('/').filter((p: string) => p);

            const object = await resolvePath(bucketObj.name, pathSegments);

            if (!object) {
                return res.status(404).send('Object not found');
            }

            await updateStatsInRedis(bucketObj.id, {
                requestsCount: 1,
                s3RequestsServed: 1,
                bytesServed: Number(object.size)
            });

            return res.sendFile(getObjectPath(bucketObj.name, object.id), {
                headers: {
                    'Content-Type': object.mimeType,
                    'Content-Length': object.size.toString(),
                    'Content-Disposition': `inline; filename="${object.filename}"`,
                },
            }, (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    return res.status(500).send('Error serving file');
                }
            });
        } catch (err: any) {
            console.error('Error in GetObject handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}