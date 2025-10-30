import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { resolvePath } from '../../../../common/object-nesting';

export default function S3Handlers_ListObjectsV2(router: express.Router) {
    router.get('/:bucket', async (req, res) => {
    try {
        const { bucket } = req.params;

        const listType = req.query["list-type"];
        if (listType !== '2') {
            return res.status(400).send('Only ListObjectsV2 is supported');
        }

        const { prefix, delimiter } = req.query;
        const prefixStr = Array.isArray(prefix) ? prefix[0] : (typeof prefix === 'string' ? prefix : '');
        const safePrefixStr = typeof prefixStr === 'string' ? prefixStr : '';

        const maxKeys = req.query["max-keys"] ? parseInt(req.query["max-keys"] as string, 10) : 1000;
        const continuationToken = req.query["continuation-token"] as string | undefined;

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
                req.method === 'PUT' || req.method === 'POST' ? req.body : undefined,
                accessKeyId,
                credentialsInDb.secretKey
            );

            if (!result.isValid) {
                return res.status(403).send('Invalid signature');
            }
        }

        const decodedPrefix = decodeURIComponent(safePrefixStr);

        const pathSegments = decodedPrefix.split('/').filter(p => p);

        const object = await resolvePath(bucketObj.name, pathSegments);

        const objects = await prisma.object.findMany({
            where: {
                bucketId: bucketObj.id,
                parentId: object ? object.id : null
            },
            take: maxKeys,
            orderBy: {
                createdAt: 'asc'
            }
        });

        const xml = `
            <?xml version="1.0" encoding="UTF-8"?>
            <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                <IsTruncated>${objects.length === maxKeys}</IsTruncated>
                <Name>${bucketObj.name}</Name>
                <Prefix>${safePrefixStr}</Prefix>
                <MaxKeys>${maxKeys}</MaxKeys>
                <Delimiter>${delimiter || ''}</Delimiter>
                <KeyCount>${objects.length}</KeyCount>
                    ${objects.map(o => {
                        if (o.mimeType === 'folder') {
                            return `
                                    <CommonPrefixes>
                                        <Prefix>${o.filename}${o.filename.endsWith('/') ? '' : '/'}</Prefix>
                                    </CommonPrefixes>
                                    `;
                        }

                        return `
                            <Contents>
                                <Key>${pathSegments.join('/')}/${o.filename}</Key>
                                <LastModified>${o.updatedAt.toISOString()}</LastModified>
                                <ETag>"${o.id}"</ETag>
                                <Size>${o.size}</Size>
                            </Contents>
                        `;
                    }).join('')}
                <ContinuationToken>${continuationToken || ''}</ContinuationToken>
            </ListBucketResult>
        `;

        res.setHeader('Content-Type', 'application/xml');
        res.status(200).send(xml);
    } catch (err: any) {
        console.error('Error in ListObjectsV2 handler:', err);
        return res.status(500).send(`Internal server error: ${err?.message || err}`);
    }
});
}