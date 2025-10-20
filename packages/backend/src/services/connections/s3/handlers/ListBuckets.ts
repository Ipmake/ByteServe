import express from 'express';
import { prisma } from '../../../..';
import { S3SigV4Auth } from '../SigV4Util';

export default function S3Handlers_ListBuckets(router: express.Router) {
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
}