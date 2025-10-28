import { S3SigV4Auth } from '../SigV4Util';
import { prisma } from '../../../worker';
import WorkerTools from '../../WorkerTools';

export async function S3WorkerHandlers_ListBuckets(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
    await WorkerTools.ensureWorkerReady();

    console.log('Handling ListBuckets request');
    const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

    if (!accessKeyId) {
        return {
            status: 403,
            body: 'Forbidden'
        };
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
        return {
            status: 403,
            body: 'Forbidden'
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

    const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Owner>
                <ID>${credentialsInDb.userId}</ID>
                <DisplayName>${credentialsInDb.user.username}</DisplayName>
            </Owner>
            <Buckets>
                ${credentialsInDb.bucketAccess.map(ba => `
                <Bucket>
                    <Name>${ba.bucket.name}</Name>
                    <CreationDate>${ba.bucket.createdAt.toISOString()}</CreationDate>
                </Bucket>
                `).join('\n')}
            </Buckets>
        </ListAllMyBucketsResult>
    `;

    return {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    };
}