import express from 'express';
import { prisma } from '../../../..';
import { S3SigV4Auth } from '../SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import fs from 'fs/promises';

export default function S3Handlers_DeleteObject(router: express.Router) {
   router.delete('/:bucket/*', async (req, res) => {
        const { bucket } = req.params;
        const objectPath = (req.params as any)[0] || '';

        // Get bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket
            },
        });

        if (!bucketObj) return res.status(404).send('Bucket not found');

        if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
            const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

            if (!accessKeyId) return res.status(401).send('Unauthorized');

            const credentialsInDb = await prisma.s3Credential.findUnique({
                where: {
                    accessKey: accessKeyId,
                    bucketAccess: { some: { bucketId: bucketObj.id } }
                },
                include: {
                    user: true
                }
            });
            if (!credentialsInDb) return res.status(401).send('Unauthorized');

            const result = S3SigV4Auth.verifyWithPathDetection(
                req.method,
                req.originalUrl,
                req.path,
                req.headers,
                req.method === 'PUT' || req.method === 'POST' ? req.body : undefined,
                accessKeyId,
                credentialsInDb.secretKey
            );

            if (!result.isValid) return res.status(403).send('Invalid signature');
        }

        const pathSegments = objectPath.split('/').filter((p: string) => p);

        const object = await resolvePath(bucketObj.name, pathSegments);

        if (!object) return res.status(404).send('Object not found');

        await prisma.object.delete({
            where: {
                id: object.id
            }
        });

        await fs.unlink(getObjectPath(bucketObj.name, object.id)).catch(() => {});

        res.status(204).send();
    });
}