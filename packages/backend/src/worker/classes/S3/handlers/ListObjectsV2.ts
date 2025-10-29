import { prisma } from '../../../worker';
import { S3SigV4Auth } from '../SigV4Util';
import WorkerTools from '../../WorkerTools';

export async function S3WorkerHandlers_ListObjectsV2(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
    await WorkerTools.ensureWorkerReady();

    const { bucket } = req.params;

    const listType = req.query["list-type"];
    if (listType !== '2') {
        return {
            status: 400,
            body: 'Only ListObjectsV2 is supported'
        };
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
        return {
            status: 404,
            body: 'Bucket not found'
        };
    }

    if (bucketObj.access === 'private') {
        const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

        if (!accessKeyId) {
            return {
                status: 401,
                body: 'Unauthorized'
            };
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
            return {
                status: 401,
                body: 'Unauthorized'
            };
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
            return {
                status: 403,
                body: 'Invalid signature'
            };
        }
    }

    const decodedPrefix = decodeURIComponent(safePrefixStr);

    const pathSegments = decodedPrefix.split('/').filter(p => p);

    const object = await WorkerTools.resolvePath(bucketObj.name, pathSegments);

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

    return {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    };
}