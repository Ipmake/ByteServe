import { prisma } from '../../../worker';
import { S3SigV4Auth } from '../SigV4Util';
import WorkerTools from '../../WorkerTools';
import fs from 'fs/promises';

export async function S3WorkerHandlers_DeleteObject(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
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
        status: 404, body: {
            message: 'Bucket not found'
        }
    };

    if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
        const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

        if (!accessKeyId) return { status: 401, body: { message: 'Unauthorized' } };

        const credentialsInDb = await prisma.s3Credential.findUnique({
            where: {
                accessKey: accessKeyId,
                bucketAccess: { some: { bucketId: bucketObj.id } }
            },
            include: {
                user: true
            }
        });
        if (!credentialsInDb) return { status: 401, body: { message: 'Unauthorized' } };

        const result = S3SigV4Auth.verifyWithPathDetection(
            req.method,
            req.originalUrl,
            req.path,
            req.headers,
            req.method === 'PUT' || req.method === 'POST' ? req.body : undefined,
            accessKeyId,
            credentialsInDb.secretKey
        );

        if (!result.isValid) return { status: 403, body: { message: 'Invalid signature' } };
    }

    const pathSegments = objectPath.split('/').filter((p: string) => p);

    const object = await WorkerTools.resolvePath(bucketObj.name, pathSegments);

    if (!object) return { status: 404, body: { message: 'Object not found' } };

    await prisma.object.delete({
        where: {
            id: object.id
        }
    });

    await fs.unlink(WorkerTools.getObjectPath(bucketObj.name, object.id)).catch(() => { });

    return { status: 204, body: {} };
}