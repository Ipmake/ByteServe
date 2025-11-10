import express from 'express';
import { prisma, redis } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { escapeXml } from '../utils/xmlEscape';

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

export default function S3Handlers_ListMultipartUploads(router: express.Router) {
    router.get('/:bucket', async (req: express.Request, res) => {
        try {
            const uploadsQuery = req.query.uploads;

            // Only handle list multipart uploads requests
            if (uploadsQuery === undefined) {
                return;
            }

            const { bucket } = req.params;

            const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
            const delimiter = typeof req.query.delimiter === 'string' ? req.query.delimiter : '';
            const maxUploads = req.query['max-uploads'] ? parseInt(req.query['max-uploads'] as string, 10) : 1000;
            const keyMarker = typeof req.query['key-marker'] === 'string' ? req.query['key-marker'] : '';
            const uploadIdMarker = typeof req.query['upload-id-marker'] === 'string' ? req.query['upload-id-marker'] : '';

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

            // Get all multipart upload sessions for this bucket
            const allKeys = await redis.keys('s3:multipartupload:*');
            const uploads: Array<{
                uploadId: string;
                key: string;
                initiated: string;
            }> = [];

            for (const redisKey of allKeys) {
                const uploadId = redisKey.replace('s3:multipartupload:', '');
                const session = await redis.json.GET(redisKey) as UploadSession | null;

                if (!session || session.bucket.id !== bucketObj.id) {
                    continue;
                }

                // Build the full key path
                const parentPath = session.parent ? await getParentPath(session.parent.id) : '';
                const fullKey = parentPath ? `${parentPath}/${session.filename}` : session.filename;

                // Apply prefix filter
                if (prefix && !fullKey.startsWith(prefix)) {
                    continue;
                }

                // Apply marker filter
                if (keyMarker && fullKey <= keyMarker) {
                    continue;
                }
                if (uploadIdMarker && keyMarker === fullKey && uploadId <= uploadIdMarker) {
                    continue;
                }

                uploads.push({
                    uploadId,
                    key: fullKey,
                    initiated: new Date().toISOString() // We don't store the initiated date, use current as approximation
                });
            }

            // Sort uploads by key and uploadId
            uploads.sort((a, b) => {
                if (a.key !== b.key) return a.key.localeCompare(b.key);
                return a.uploadId.localeCompare(b.uploadId);
            });

            // Paginate
            const isTruncated = uploads.length > maxUploads;
            const uploadsToReturn = uploads.slice(0, maxUploads);
            const nextKeyMarker = isTruncated ? uploadsToReturn[uploadsToReturn.length - 1].key : undefined;
            const nextUploadIdMarker = isTruncated ? uploadsToReturn[uploadsToReturn.length - 1].uploadId : undefined;

            // Build XML response
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Bucket>${escapeXml(bucketObj.name)}</Bucket>
    <KeyMarker>${escapeXml(keyMarker)}</KeyMarker>
    <UploadIdMarker>${escapeXml(uploadIdMarker)}</UploadIdMarker>${nextKeyMarker ? `
    <NextKeyMarker>${escapeXml(nextKeyMarker)}</NextKeyMarker>` : ''}${nextUploadIdMarker ? `
    <NextUploadIdMarker>${escapeXml(nextUploadIdMarker)}</NextUploadIdMarker>` : ''}
    <Delimiter>${escapeXml(delimiter)}</Delimiter>
    <Prefix>${escapeXml(prefix)}</Prefix>
    <MaxUploads>${maxUploads}</MaxUploads>
    <IsTruncated>${isTruncated}</IsTruncated>${uploadsToReturn.map(upload => `
    <Upload>
        <Key>${escapeXml(upload.key)}</Key>
        <UploadId>${escapeXml(upload.uploadId)}</UploadId>
        <Initiator>
            <ID>unknown</ID>
            <DisplayName>unknown</DisplayName>
        </Initiator>
        <Owner>
            <ID>${escapeXml(bucketObj.ownerId)}</ID>
            <DisplayName>owner</DisplayName>
        </Owner>
        <StorageClass>STANDARD</StorageClass>
        <Initiated>${upload.initiated}</Initiated>
    </Upload>`).join('')}
</ListMultipartUploadsResult>`;

            res.setHeader('Content-Type', 'application/xml');
            return res.status(200).send(xml);

            // Helper function to get parent path
            async function getParentPath(parentId: string): Promise<string> {
                const parent = await prisma.object.findUnique({
                    where: { id: parentId }
                });

                if (!parent) return '';

                if (parent.parentId) {
                    const grandParentPath = await getParentPath(parent.parentId);
                    return grandParentPath ? `${grandParentPath}/${parent.filename}` : parent.filename;
                }

                return parent.filename;
            }
        } catch (err: any) {
            console.error('Error in ListMultipartUploads handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}
