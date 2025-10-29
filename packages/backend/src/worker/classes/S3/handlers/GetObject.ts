import { prisma } from '../../../worker';
import { S3SigV4Auth } from '../SigV4Util';
import WorkerTools from '../../WorkerTools';
import { createReadStream } from 'fs';
import { MessagePort } from 'worker_threads';
import { pipeline } from 'stream';
import { MessagePortDuplex } from '../../../../common/stream';

export async function S3WorkerHandlers_GetObject(data: {
    port: MessagePort;
    req: Worker.WorkerRequest;
}): Promise<Worker.WorkerResponse> {
    try {
        const req = data.req;

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

        await WorkerTools.updateStatsInRedis(bucketObj.id, {
            requestsCount: 1,
            s3RequestsServed: 1,
            bytesServed: Number(object.size)
        });

        data.port.postMessage({
            type: 'metadata',
            contentLength: Number(object.size),
            mimeType: object.mimeType,
            filename: object.filename,
        })

        await new Promise<void>((resolve, reject) => {
            setImmediate(resolve);
        });

        await new Promise<void>((resolve, reject) => {
            const duplex = new MessagePortDuplex(data.port);

            pipeline(
                createReadStream(WorkerTools.getObjectPath(bucketObj.name, object.id), { highWaterMark: 1024 * 1024 }),
                duplex,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            )
        });

        return {
            status: 200,
            body: null,
            headers: {
                'Content-Length': object.size.toString(),
                'Content-Type': object.mimeType,
                'ETag': `"${object.id}"`
            }
        }
    } catch (err: any) {
        console.error('Error in GetObject handler:', err);
        return { status: 500, body: `Internal server error: ${err?.message || err}` };
    }
}