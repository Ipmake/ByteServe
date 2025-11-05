import express from 'express';
import { prisma, redis } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, getStorageDir, resolvePath } from '../../../../common/object-nesting';
import { randomUUID, randomBytes } from 'crypto';
import path from 'path';
import mime from 'mime-types';
import fs from 'fs/promises';
import { CheckUserQuota } from '../../../../common/file-upload';

interface UploadSession {
    bucket: {
        id: string;
        name: string;
        ownerId: string;
        access: string;
        storageQuota: number;
        createdAt: Date;
        updatedAt: Date;
        owner?: {
            id: string;
            username: string;
            storageQuota: number;
            createdAt: Date;
            updatedAt: Date;
        };
    };
    filename: string;
    parent: {
        id: string;
        bucketId: string;
    } | null;
    tempFileBase: string;
    tempFileParts: {
        partNum: number;
        path: string;
        etag: string;
    }[];
    mimeType: string;
}

export default function S3Handlers_PostObject(router: express.Router) {
    router.post('/:bucket{/*objectPath}', async (req, res) => {
        try {
            const { bucket } = req.params;
            const objectPathParam = (req.params as any).objectPath || [];
            const objectPath = Array.isArray(objectPathParam) ? objectPathParam.join('/') : objectPathParam;
            const { uploads, uploadId } = req.query;

            console.log(`[S3] Received S3 POST request for bucket: ${bucket}, objectPath: ${objectPath}, uploads: ${uploads}, uploadId: ${uploadId}`);

            if (uploads === undefined && uploadId === undefined) return res.status(400).send('Missing uploads or uploadId query parameter');

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
                },
                include: { owner: true }
            });

            if (!bucketObj) return res.status(404).send('Bucket not found');

            if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) return res.status(401).send('Unauthorized');

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

            // Initiate multipart upload
            if (uploads !== undefined) {
                const pathSegments = objectPath.split('/').filter((p: string) => p);
                const filename = pathSegments[pathSegments.length - 1];
                const parentPathSegments = pathSegments.slice(0, -1);

                const parentObject = parentPathSegments.length > 0
                    ? await resolvePath(bucketObj.name, parentPathSegments)
                    : null;

                if (parentObject?.mimeType !== 'folder' && parentObject?.id) return res.status(400).send('Parent path is not a folder');

                const uploadSessionID = randomUUID();

                const tempFile = path.join(getStorageDir(), ".temp", `multipart_${uploadSessionID}_{{partNumber}}`);

                redis.json.SET(`s3:multipartupload:${uploadSessionID}`, "$", {
                    bucket: {
                        id: bucketObj.id,
                        name: bucketObj.name,
                        ownerId: bucketObj.ownerId,
                        access: bucketObj.access,
                        storageQuota: Number(bucketObj.storageQuota),
                        createdAt: bucketObj.createdAt,
                        updatedAt: bucketObj.updatedAt,
                    },
                    filename: filename,
                    parent: parentObject ? {
                        id: parentObject.id,
                        bucketId: parentObject.bucketId,
                    } : null,
                    tempFileBase: tempFile,
                    tempFileParts: [],
                    mimeType: req.headers['content-type'] || mime.lookup(filename) || 'application/octet-stream',
                } satisfies UploadSession);

                res.setHeader('Content-Type', 'application/xml');
                return res.status(200).send(`
                <InitiateMultipartUploadResult>
                    <Bucket>${bucketObj.name}</Bucket>
                    <Key>${objectPath}</Key>
                    <UploadId>${uploadSessionID}</UploadId>
                </InitiateMultipartUploadResult>
            `);
            }

            // Handle multipart upload part completion
            if (uploadId) {
                const uploadSession = await redis.json.GET(`s3:multipartupload:${uploadId as string}`) as UploadSession | null;

                if (!uploadSession) return res.status(404).send('Upload session not found');

                // Create final file by concatenating parts
                const finalFilePath = path.join(getStorageDir(), ".temp", `multipart_final_${uploadId}`);

                const file = await fs.open(finalFilePath, 'w');

                const writeStream = file.createWriteStream({ highWaterMark: 1024 * 1024 });

                const partsArray = uploadSession.tempFileParts.sort((a, b) => a.partNum - b.partNum);

                for (const part of partsArray) {
                    const partFile = await fs.open(part.path, 'r');
                    const partDataStream = partFile.createReadStream({ highWaterMark: 1024 * 1024 });

                    partDataStream.pipe(writeStream, { end: false });

                    await new Promise<void>((resolve, reject) => {
                        partDataStream.on('end', async () => {
                            // Delete part file after appending
                            await fs.unlink(part.path).catch(() => { });
                            partDataStream.close();
                            resolve();
                        });
                        partDataStream.on('error', (err) => {
                            reject(err);
                        });
                    });
                }

                writeStream.end();

                await new Promise<void>((resolve, reject) => {
                    writeStream.on('finish', async () => {
                        resolve();
                    });

                    writeStream.on('error', (err) => {
                        reject(err);
                    });
                });

                const existingObject = await prisma.object.findFirst({
                    where: {
                        bucketId: uploadSession.bucket.id,
                        filename: uploadSession.filename,
                        parentId: uploadSession.parent ? uploadSession.parent.id : null,
                    }
                });

                const newObject = existingObject ?? await prisma.object.create({
                    data: {
                        bucketId: uploadSession.bucket.id,
                        filename: uploadSession.filename,
                        mimeType: uploadSession.mimeType,
                        size: (await fs.stat(finalFilePath)).size,
                        parentId: uploadSession.parent ? uploadSession.parent.id : null,
                    }
                });

                // Move final file to storage location
                const storagePath = getObjectPath(uploadSession.bucket.name, newObject.id);
                await fs.rename(finalFilePath, storagePath);

                // Clean up upload session
                await redis.del(uploadId as string);

                console.log(`[S3] Multipart upload completed: ${newObject.id}, size: ${newObject.size}`);

                res.setHeader('Content-Type', 'application/xml');
                return res.status(200).send(`
                    <CompleteMultipartUploadResult>
                    <Location>${req.protocol}://${req.headers.host}/s3/${uploadSession.bucket.name}/${objectPath}</Location>
                    <Bucket>${uploadSession.bucket.name}</Bucket>
                    <Key>${objectPath}</Key>
                    <ETag>"${newObject.id}"</ETag>
                    </CompleteMultipartUploadResult>
                `);
            }

            return res.status(400).send('Invalid request');
        } catch (err: any) {
            console.error('Error in PostMultiPartUpload handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    });

    router.put('/:bucket{/*objectPath}', async (req, res) => {
        try {
            const { partNumber, uploadId } = req.query;

            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: req.params.bucket
                },
                include: { owner: true }
            });

            if (!bucketObj) return res.status(404).send('Bucket not found');

            let AuthenticatedUser: {
                id: string;
                accessKeyId: string;
            } | null = null;

            if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) return res.status(401).send('Unauthorized');

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

                AuthenticatedUser = {
                    id: credentialsInDb.userId,
                    accessKeyId: credentialsInDb.accessKey
                };
            }

            // Check if user has enough quota
            const hasQuota = await CheckUserQuota(bucketObj, req.body.length);
            if (!hasQuota) return res.status(403).send('Insufficient storage quota');

            // Single part upload
            if (!partNumber || !uploadId) {
                const copySrc = req.headers['x-amz-copy-source'];

                const objectPathParam = (req.params as any).objectPath || [];
                const objectPathStr = Array.isArray(objectPathParam) ? objectPathParam.join('/') : objectPathParam;
                const pathSegments: string[] = objectPathStr.split('/').filter((p: string) => p);
                const filename = pathSegments[pathSegments.length - 1];
                const parentPathSegments = pathSegments.slice(0, -1);

                const parentObject = parentPathSegments.length > 0
                    ? await resolvePath(bucketObj.name, parentPathSegments)
                    : null;

                if (parentObject?.mimeType !== 'folder' && parentObject?.id) {
                    return res.status(400).send('Parent path is not a folder');
                }

                // Create a folder
                if (objectPathStr.endsWith('/')) {
                    await prisma.object.create({
                        data: {
                            bucketId: bucketObj.id,
                            filename: filename,
                            mimeType: 'folder',
                            size: 0,
                            parentId: parentObject ? parentObject.id : null,
                        }
                    });

                    return res.status(200).send();
                }

                const tempFilePath = path.join(getStorageDir(), ".temp", `singlepart_${randomUUID()}`);

                if (copySrc && typeof copySrc === 'string') {
                    const srcPath = decodeURIComponent(copySrc);
                    const srcPathSegments = srcPath.split('/').filter(p => p);
                    const srcBucketName = srcPathSegments[0];
                    const srcObjectPathSegments = srcPathSegments.slice(1);

                    const srcBucket = await prisma.bucket.findFirst({
                        where: {
                            name: srcBucketName,
                            OR: [
                                {
                                    S3BucketAccess: {
                                        some: {
                                            credential: {
                                                accessKey: AuthenticatedUser?.accessKeyId
                                            },
                                        }
                                    }
                                },
                                {
                                    access: 'public-read'
                                },
                                {
                                    access: 'public-write'
                                }
                            ]
                        }
                    });

                    if (!srcBucket) return res.status(404).send('Source bucket not found');

                    const srcObject = await resolvePath(srcBucket.name, srcObjectPathSegments);

                    if (!srcObject) return res.status(404).send('Source object not found');

                    const srcObjectPathOnDisk = getObjectPath(srcBucket.name, srcObject.id);

                    await fs.copyFile(srcObjectPathOnDisk, tempFilePath);
                } else {
                    const file = await fs.open(tempFilePath, 'w');
                    const writeStream = file.createWriteStream({ highWaterMark: 1024 * 1024 });// 1MB chunk size
 
                    req.pipe(writeStream);
                    
                    await new Promise<void>((resolve, reject) => {
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                    });
                }

                const existingObject = await prisma.object.findFirst({
                    where: {
                        bucketId: bucketObj.id,
                        filename: filename,
                        parentId: parentObject ? parentObject.id : null,
                    }
                });

                const targetObject = existingObject ?? await prisma.object.create({
                    data: {
                        bucketId: bucketObj.id,
                        filename: filename,
                        mimeType: req.headers['content-type'] || mime.lookup(filename) || 'application/octet-stream',
                        size: (await fs.stat(tempFilePath)).size,
                        parentId: parentObject ? parentObject.id : null,
                    }
                });

                const storagePath = getObjectPath(bucketObj.name, targetObject.id);
                await fs.rename(tempFilePath, storagePath);

                console.log(`[S3] Single part upload completed: ${targetObject.id}, size: ${targetObject.size}`);

                res.setHeader('Content-Type', 'application/xml');

                res.status(200).send(`
                    <CompleteMultipartUploadResult>
                        <Location>${req.protocol}://${req.headers.host}/s3/${bucketObj.name}/${targetObject.id}</Location>
                        <Bucket>${bucketObj.name}</Bucket>
                        <Key>${targetObject.id}</Key>
                        <ETag>"${targetObject.id}"</ETag>
                    </CompleteMultipartUploadResult>
                `);
            }
            // Multipart upload part upload
            else {
                const partNum = parseInt(partNumber as string, 10);
                if (isNaN(partNum) || partNum <= 0) {
                    return res.status(400).send('Invalid partNumber');
                }

                const uploadSession = await redis.json.GET(`s3:multipartupload:${uploadId as string}`) as UploadSession | null;

                if (!uploadSession) return res.status(404).send('Upload session not found');

                const tempFilePath = uploadSession.tempFileBase.replace('{{partNumber}}', partNum.toString());

                // TODO
                const contentHash = randomBytes(16).toString('hex');

                console.log(`[S3] Writing part ${partNum} to ${tempFilePath} with MD5 ${contentHash} size ${req.body.length}`);


                const file = await fs.open(tempFilePath, 'w');
                const writeStream = file.createWriteStream({ highWaterMark: 1024 * 1024 });

                req.pipe(writeStream);
                
                await new Promise<void>((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });

                await redis.json.arrAppend(`s3:multipartupload:${uploadId as string}`, '.tempFileParts', {
                    partNum,
                    path: tempFilePath,
                    etag: contentHash
                } satisfies UploadSession['tempFileParts'][0]);

                res.header('ETag', `"${contentHash}"`);
                return res.status(200).send('');
            }
        } catch (err: any) {
            console.error('Error in PutMultiPartUpload handler:', err);
            return res.status(500).send(`Internal server error: ${err?.message || err}`);
        }
    })
}