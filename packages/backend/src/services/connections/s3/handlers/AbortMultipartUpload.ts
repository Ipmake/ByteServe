import express from 'express';
import { prisma, redis } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import fs from 'fs/promises';

interface UploadSession {
    bucket: {
        id: string;
        name: string;
        ownerId: string;
        access: string;
        storageQuota: number;
        createdAt: Date;
        updatedAt: Date;
    };
    filename: string;
    parent: {
        id: string;
        bucketId: string;
    } | null;
    tempFileBase: string;
    tempFileParts: {
        partNum: number;
        path: string;
        etag: string;
    }[];
    mimeType: string;
}

export default function S3Handlers_AbortMultipartUpload(router: express.Router) {
    router.delete('/:bucket{/*objectPath}', async (req: express.Request, res) => {
        try {
            const { uploadId } = req.query;

            // Only handle abort multipart upload requests
            if (!uploadId) {
                return;
            }

            const { bucket } = req.params;

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
                }
            });

            if (!bucketObj) {
                return res.status(404).send('Bucket not found');
            }

            if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) {
                    return res.status(401).send('Unauthorized');
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
                    return res.status(401).send('Unauthorized');
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
                    return res.status(403).send('Invalid signature');
                }
            }

            // Get upload session
            const uploadSession = await redis.json.GET(`s3:multipartupload:${uploadId as string}`) as UploadSession | null;

            if (!uploadSession) {
                return res.status(404).send('Upload session not found');
            }

            // Delete all part files
            for (const part of uploadSession.tempFileParts) {
                try {
                    await fs.unlink(part.path);
                } catch (err) {
                    console.error(`Failed to delete part file ${part.path}:`, err);
                }
            }

            // Delete the upload session from Redis
            await redis.del(`s3:multipartupload:${uploadId as string}`);

            console.log(`[S3] Aborted multipart upload: ${uploadId}`);

            return res.status(204).send();
        } catch (err: any) {
            console.error('Error in AbortMultipartUpload handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}
