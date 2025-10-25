import { prisma } from '../../../worker';
import { S3SigV4Auth } from '../SigV4Util';
import WorkerTools from '../../WorkerTools';
import fs from 'fs/promises';

export async function S3WorkerHandlers_GetObject(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
    await WorkerTools.ensureWorkerReady();

    const { bucket } = req.params;
    const objectPath = (req.params as any)[0] || '';

    // Get bucket
    const bucketObj = await prisma.bucket.findFirst({
        where: {
            name: bucket
        },
    });

    if (!bucketObj) return {
        status: 404, body: 'Bucket not found'
    };

    if (bucketObj.access === 'private') {
        const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

        if (!accessKeyId) return { status: 401, body: 'Unauthorized' };

        const credentialsInDb = await prisma.s3Credential.findUnique({
            where: {
                accessKey: accessKeyId,
                bucketAccess: {
                    some: { bucketId: bucketObj.id }
                }
            },
            include: {
                user: true
            }
        });
        if (!credentialsInDb) return { status: 401, body: 'Unauthorized' };

        const result = S3SigV4Auth.verifyWithPathDetection(
            req.method,
            req.originalUrl,
            req.path,
            req.headers,
            req.method === 'PUT' || req.method === 'POST' ? req.body : undefined,
            accessKeyId,
            credentialsInDb.secretKey
        );

        if (!result.isValid) return { status: 403, body: 'Invalid signature' };
    }

    const pathSegments = objectPath.split('/').filter((p: string) => p);

    const object = await WorkerTools.resolvePath(bucketObj.name, pathSegments);

    if (!object) return { status: 404, body: 'Object not found' };

    const file = await fs.readFile(WorkerTools.getObjectPath(bucketObj.name, object.id));

    return {
        status: 200,
        body: file,
        headers: {
            'Content-Length': object.size.toString(),
            'Content-Type': object.mimeType,
            'ETag': `"${object.id}"`
        }
    }
}