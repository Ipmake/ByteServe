import express from 'express';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { prisma } from '../../../../fork';
import { escapeXml } from '../utils/xmlEscape';

export default function S3Handlers_ListBuckets(router: express.Router) {
    router.get('/', async (req, res) => {
    try {
        const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

        if (!accessKeyId) {
            return res.status(403).send('Forbidden');
        }

        const credentialsInDb = await prisma.s3Credential.findUnique({
            where: {
                accessKey: accessKeyId
            },
            include: {
                user: true,
                bucketAccess: {
                    include: {
                        bucket: true
                    }
                }
            }
        });

        if (!credentialsInDb) {
            return res.status(403).send('Forbidden');
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

        const xml = `
            <?xml version=\"1.0\" encoding=\"UTF-8\"?>
            <ListAllMyBucketsResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">
                <Owner>
                    <ID>${escapeXml(credentialsInDb.userId)}</ID>
                    <DisplayName>${escapeXml(credentialsInDb.user.username)}</DisplayName>
                </Owner>
                <Buckets>
                    ${credentialsInDb.bucketAccess.map(ba => `
                    <Bucket>
                        <Name>${escapeXml(ba.bucket.name)}</Name>
                        <CreationDate>${ba.bucket.createdAt.toISOString()}</CreationDate>
                    </Bucket>
                    `).join('\n')}
                </Buckets>
            </ListAllMyBucketsResult>
        `;

        res.setHeader('Content-Type', 'application/xml');
        return res.status(200).send(xml);
    } catch (err: any) {
        console.error('Error in ListBuckets handler:', err);
        return res.status(500).send(`Internal server error: ${err?.message || err}`);
    }
});
}