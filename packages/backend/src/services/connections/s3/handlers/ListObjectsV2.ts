import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { resolvePath } from '../../../../common/object-nesting';
import { escapeXml } from '../utils/xmlEscape';

export default function S3Handlers_ListObjectsV2(router: express.Router) {
    router.get('/:bucket', async (req, res) => {
        try {
            const { bucket } = req.params;

            // Check which API version to use
            const listType = req.query["list-type"];
            const isV2 = listType === '2';
            const isV1 = !listType || listType === '1';
            
            // Accept both V1 and V2
            if (!isV1 && !isV2) {
                return res.status(400).send('Invalid list-type parameter');
            }

            const { prefix, delimiter } = req.query;
            const prefixStr = Array.isArray(prefix) ? prefix[0] : (typeof prefix === 'string' ? prefix : '');
            const safePrefixStr = typeof prefixStr === 'string' ? prefixStr : '';
            const delimiterStr = typeof delimiter === 'string' ? delimiter : (Array.isArray(delimiter) ? String(delimiter[0]) : '');
            
            // V2 uses start-after and continuation-token, V1 uses marker
            const startAfter = req.query["start-after"] as string | undefined;
            const continuationToken = req.query["continuation-token"] as string | undefined;
            const marker = req.query["marker"] as string | undefined;

            const maxKeys = req.query["max-keys"] ? parseInt(req.query["max-keys"] as string, 10) : 1000;

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

            // S3 prefix semantics: list all objects whose keys start with prefix
            // We need to recursively get all objects and filter by prefix
            async function getAllObjectsWithPrefix(parentId: string | null, currentPath: string): Promise<Array<{
                fullKey: string;
                obj: any;
            }>> {
                const children = await prisma.object.findMany({
                    where: {
                        bucketId: bucketObj!.id,
                        parentId: parentId
                    },
                    orderBy: {
                        filename: 'asc'
                    }
                });

                const results: Array<{ fullKey: string; obj: any }> = [];

                for (const child of children) {
                    const childKey = currentPath ? `${currentPath}/${child.filename}` : child.filename;
                    
                    // Check if this key starts with the prefix
                    if (childKey.startsWith(decodedPrefix)) {
                        results.push({ fullKey: childKey, obj: child });
                    }

                    // Recursively check children of folders
                    if (child.mimeType === 'folder') {
                        const childResults = await getAllObjectsWithPrefix(child.id, childKey);
                        results.push(...childResults);
                    }
                }

                return results;
            }

            // Get all objects that match the prefix
            let allMatchingObjects = await getAllObjectsWithPrefix(null, '');

            // Apply filtering based on API version
            // V2 uses startAfter and continuationToken, V1 uses marker
            const filterKey = isV2 ? (startAfter || continuationToken) : marker;
            if (filterKey) {
                allMatchingObjects = allMatchingObjects.filter(item => item.fullKey > filterKey);
            }

            // Sort by key
            allMatchingObjects.sort((a, b) => a.fullKey.localeCompare(b.fullKey));

            // Paginate
            const isTruncated = allMatchingObjects.length > maxKeys;
            const objectsToReturn = allMatchingObjects.slice(0, maxKeys);
            const nextMarker = isTruncated ? objectsToReturn[objectsToReturn.length - 1].fullKey : undefined;

            // Group objects by common prefixes if delimiter is specified
            const contents: any[] = [];
            const commonPrefixes: Set<string> = new Set();

            for (const { fullKey, obj } of objectsToReturn) {
                if (delimiterStr) {
                    // Find the first occurrence of delimiter after the prefix
                    const keyAfterPrefix = fullKey.substring(decodedPrefix.length);
                    const delimiterIndex = keyAfterPrefix.indexOf(delimiterStr);
                    
                    if (delimiterIndex >= 0) {
                        // This should be grouped as a common prefix
                        const commonPrefix = decodedPrefix + keyAfterPrefix.substring(0, delimiterIndex + 1);
                        commonPrefixes.add(commonPrefix);
                        continue;
                    }
                }

                // Add as regular content (not a common prefix)
                if (obj.mimeType === 'folder') {
                    // Folders are represented as common prefixes with trailing slash
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

            // Build XML response based on API version
            let xml: string;
            
            if (isV2) {
                // ListObjectsV2 format
                xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>${escapeXml(bucketObj.name)}</Name>
    <Prefix>${escapeXml(safePrefixStr)}</Prefix>
    <KeyCount>${contents.length + commonPrefixes.size}</KeyCount>
    <MaxKeys>${maxKeys}</MaxKeys>
    <Delimiter>${escapeXml(delimiterStr)}</Delimiter>
    <IsTruncated>${isTruncated}</IsTruncated>${continuationToken ? `
    <ContinuationToken>${escapeXml(continuationToken)}</ContinuationToken>` : ''}${nextMarker ? `
    <NextContinuationToken>${escapeXml(nextMarker)}</NextContinuationToken>` : ''}${contents.map(c => `
    <Contents>
        <Key>${escapeXml(c.key)}</Key>
        <LastModified>${c.lastModified}</LastModified>
        <ETag>${escapeXml(c.etag)}</ETag>
        <Size>${c.size}</Size>
    </Contents>`).join('')}${Array.from(commonPrefixes).map(prefix => `
    <CommonPrefixes>
        <Prefix>${escapeXml(prefix)}</Prefix>
    </CommonPrefixes>`).join('')}
</ListBucketResult>`;
            } else {
                // ListObjects V1 format
                xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>${escapeXml(bucketObj.name)}</Name>
    <Prefix>${escapeXml(safePrefixStr)}</Prefix>
    <Marker>${escapeXml(marker || '')}</Marker>${nextMarker ? `
    <NextMarker>${escapeXml(nextMarker)}</NextMarker>` : ''}
    <MaxKeys>${maxKeys}</MaxKeys>
    <Delimiter>${escapeXml(delimiterStr)}</Delimiter>
    <IsTruncated>${isTruncated}</IsTruncated>${contents.map(c => `
    <Contents>
        <Key>${escapeXml(c.key)}</Key>
        <LastModified>${c.lastModified}</LastModified>
        <ETag>${escapeXml(c.etag)}</ETag>
        <Size>${c.size}</Size>
    </Contents>`).join('')}${Array.from(commonPrefixes).map(prefix => `
    <CommonPrefixes>
        <Prefix>${escapeXml(prefix)}</Prefix>
    </CommonPrefixes>`).join('')}
</ListBucketResult>`;
            }

            res.setHeader('Content-Type', 'application/xml');
            res.status(200).send(xml);
        } catch (err: any) {
            console.error('Error in ListObjectsV2 handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });
}