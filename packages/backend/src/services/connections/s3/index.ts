import express from 'express';
import { S3SigV4Auth } from './SigV4Util';
import { prisma } from '../../..';
import auth from '../../../routes/auth';
import { getObjectPath, resolvePath } from '../../../common/object-nesting';

export function setupS3Server(app: express.Application) {
    console.log("Setting up S3 server routes...");

    const router = express.Router({

    });

    // log all requests
    router.use((req, res, next) => {
        console.log(`[S3] ${req.method} ${req.url}`);
        next();
    });

    // ListBuckets
    router.get('/', async (req, res) => {
        // check auth here
        const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

        if (!accessKeyId) return res.status(403).send('Forbidden');

        const credentialsInDb = await prisma.s3Credential.findUnique({
            where: {
                accessKey: accessKeyId
            },
            include: {
                user: true
            }
        });
        if (!credentialsInDb) return res.status(403).send('Forbidden');

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

        const buckets = await prisma.bucket.findMany({
            where: {
                ownerId: credentialsInDb.userId
            }
        });

        res.send(`
            <?xml version="1.0" encoding="UTF-8"?>
            <ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                <Owner>
                    <ID>${credentialsInDb.userId}</ID>
                    <DisplayName>${credentialsInDb.user.username}</DisplayName>
                </Owner>
                <Buckets>
                    ${buckets.map(b => `
                    <Bucket>
                        <Name>${b.name}</Name>
                        <CreationDate>${b.createdAt.toISOString()}</CreationDate>
                    </Bucket>
                    `).join('\n')
            }
                </Buckets>
            </ListAllMyBucketsResult>
        `);
    });

    // ListObjectsV2
    router.get('/:bucket', auth, async (req, res) => {
        const { bucket } = req.params;

        const listType = req.query["list-type"];
        if (listType !== '2') return res.status(400).send('Only ListObjectsV2 is supported');

        const { prefix, delimiter } = req.query;
        const prefixStr = Array.isArray(prefix) ? prefix[0] : (typeof prefix === 'string' ? prefix : '');

        // Ensure prefixStr is a string
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

            if (!accessKeyId) return res.status(401).send('Unauthorized');

            const credentialsInDb = await prisma.s3Credential.findUnique({
                where: {
                    accessKey: accessKeyId
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

        const decodedPrefix = decodeURIComponent(safePrefixStr);

        const object = await resolvePath(bucketObj.name, decodedPrefix.split('/').filter(p => p));

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

        res.send(`
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
                <Key>${o.filename}</Key>
                <LastModified>${o.updatedAt.toISOString()}</LastModified>
                <ETag>"${o.id}"</ETag>
                <Size>${o.size}</Size>
            </Contents>
            `;
        }).join('')}
            <ContinuationToken>${continuationToken || ''}</ContinuationToken>
            </ListBucketResult>
        `);
    });

    // GET Object
    router.get('/:bucket/*', auth, async (req, res) => {
        const { bucket } = req.params;
        const objectPath = req.params[0] || '';

        // Get bucket
        const bucketObj = await prisma.bucket.findFirst({
            where: {
                name: bucket
            },
        });

        if (!bucketObj) return res.status(404).send('Bucket not found');

        if (bucketObj.access === 'private') {
            const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

            if (!accessKeyId) return res.status(401).send('Unauthorized');

            const credentialsInDb = await prisma.s3Credential.findUnique({
                where: {
                    accessKey: accessKeyId
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

        const pathSegments = objectPath.split('/').filter(p => p);

        const object = await resolvePath(bucketObj.name, pathSegments);

        if (!object) return res.status(404).send('Object not found');

        res.setHeader('Content-Length', object.size.toString());
        res.setHeader('Content-Type', object.mimeType);
        res.setHeader('ETag', `"${object.id}"`);

        res.sendFile(getObjectPath(bucketObj.name, object.id));
    });


    app.use('/s3', express.raw({ type: '*/*', limit: '32gb' }), router);

    console.log("S3 server mounted at /s3");
}