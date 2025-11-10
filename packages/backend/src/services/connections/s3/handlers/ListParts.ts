import express from 'express';
import { prisma, redis } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';

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

export default function S3Handlers_ListParts(router: express.Router) {
    router.get('/:bucket{/*objectPath}', async (req: express.Request, res) => {
        try {
            const { uploadId } = req.query;

            // Only handle list parts requests
            if (!uploadId) {
                return;
            }

            const { bucket } = req.params;
            const objectPathParam = (req.params as any).objectPath || [];
            const objectPath = Array.isArray(objectPathParam) ? objectPathParam.join('/') : objectPathParam;

            const maxParts = req.query['max-parts'] ? parseInt(req.query['max-parts'] as string, 10) : 1000;
            const partNumberMarker = req.query['part-number-marker'] ? parseInt(req.query['part-number-marker'] as string, 10) : 0;

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
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

            // Filter and paginate parts
            const allParts = uploadSession.tempFileParts
                .filter(part => part.partNum > partNumberMarker)
                .sort((a, b) => a.partNum - b.partNum);

            const parts = allParts.slice(0, maxParts);
            const isTruncated = allParts.length > maxParts;
            const nextPartNumberMarker = isTruncated ? parts[parts.length - 1].partNum : undefined;

            // Build XML response
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>${bucketObj.name}</Bucket>
    <Key>${objectPath}</Key>
    <UploadId>${uploadId}</UploadId>
    <StorageClass>STANDARD</StorageClass>
    <PartNumberMarker>${partNumberMarker}</PartNumberMarker>${nextPartNumberMarker ? `
    <NextPartNumberMarker>${nextPartNumberMarker}</NextPartNumberMarker>` : ''}
    <MaxParts>${maxParts}</MaxParts>
    <IsTruncated>${isTruncated}</IsTruncated>${parts.map(part => `
    <Part>
        <PartNumber>${part.partNum}</PartNumber>
        <ETag>"${part.etag}"</ETag>
    </Part>`).join('')}
</ListPartsResult>`;

            res.setHeader('Content-Type', 'application/xml');
            return res.status(200).send(xml);
        } catch (err: any) {
            console.error('Error in ListParts handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}
