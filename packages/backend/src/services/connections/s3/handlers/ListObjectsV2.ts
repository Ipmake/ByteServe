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
            const delimiterStr = typeof delimiter === 'string' ? delimiter : (Array.isArray(delimiter) ? String(delimiter[0]) : '');
            const startAfter = req.query["start-after"] as string | undefined;

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

            const object = pathSegments.length > 0 
                ? await resolvePath(bucketObj.name, pathSegments)
                : null;

            // Prepare query conditions
            const whereConditions: any = {
                bucketId: bucketObj.id,
                parentId: object ? object.id : null
            };

            // Add continuation token support
            if (continuationToken) {
                whereConditions.filename = {
                    gt: continuationToken
                };
            }

            // Add startAfter support
            if (startAfter) {
                whereConditions.filename = {
                    ...whereConditions.filename,
                    gt: startAfter
                };
            }

            const objects = await prisma.object.findMany({
                where: whereConditions,
                take: maxKeys + 1, // Fetch one extra to determine if truncated
                orderBy: {
                    filename: 'asc'
                }
            });

            const isTruncated = objects.length > maxKeys;
            const objectsToReturn = isTruncated ? objects.slice(0, maxKeys) : objects;
            const nextContinuationToken = isTruncated ? objectsToReturn[objectsToReturn.length - 1].filename : undefined;

            // Group objects by common prefixes if delimiter is specified
            const contents: any[] = [];
            const commonPrefixes: Set<string> = new Set();

            for (const obj of objectsToReturn) {
                const fullKey = pathSegments.length > 0 
                    ? `${pathSegments.join('/')}/${obj.filename}`
                    : obj.filename;

                if (delimiterStr && obj.mimeType !== 'folder') {
                    // Check if object contains delimiter after prefix
                    const keyAfterPrefix = fullKey.substring(safePrefixStr.length);
                    const delimiterIndex = keyAfterPrefix.indexOf(delimiterStr);
                    
                    if (delimiterIndex > 0) {
                        // This is a common prefix
                        const commonPrefix = safePrefixStr + keyAfterPrefix.substring(0, delimiterIndex + 1);
                        commonPrefixes.add(commonPrefix);
                        continue;
                    }
                }

                if (obj.mimeType === 'folder') {
                    commonPrefixes.add(fullKey.endsWith('/') ? fullKey : `${fullKey}/`);
                } else {
                    contents.push({
                        key: fullKey,
                        lastModified: obj.updatedAt.toISOString(),
                        etag: `"${obj.id}"`,
                        size: obj.size
                    });
                }
            }

            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>${bucketObj.name}</Name>
    <Prefix>${safePrefixStr}</Prefix>
    <KeyCount>${contents.length + commonPrefixes.size}</KeyCount>
    <MaxKeys>${maxKeys}</MaxKeys>
    <Delimiter>${delimiterStr}</Delimiter>
    <IsTruncated>${isTruncated}</IsTruncated>${continuationToken ? `
    <ContinuationToken>${continuationToken}</ContinuationToken>` : ''}${nextContinuationToken ? `
    <NextContinuationToken>${nextContinuationToken}</NextContinuationToken>` : ''}${contents.map(c => `
    <Contents>
        <Key>${c.key}</Key>
        <LastModified>${c.lastModified}</LastModified>
        <ETag>${c.etag}</ETag>
        <Size>${c.size}</Size>
    </Contents>`).join('')}${Array.from(commonPrefixes).map(prefix => `
    <CommonPrefixes>
        <Prefix>${prefix}</Prefix>
    </CommonPrefixes>`).join('')}
</ListBucketResult>`;

            res.setHeader('Content-Type', 'application/xml');
            res.status(200).send(xml);
        } catch (err: any) {
            console.error('Error in ListObjectsV2 handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}