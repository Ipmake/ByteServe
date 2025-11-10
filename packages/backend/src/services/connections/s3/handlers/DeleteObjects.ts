import express from 'express';
import { prisma } from '../../../../fork';
import { S3SigV4Auth } from '../../../../common/SigV4Util';
import { getObjectPath, resolvePath } from '../../../../common/object-nesting';
import fs from 'fs/promises';
import { XMLParser } from 'fast-xml-parser';

interface DeleteRequest {
    Delete: {
        Object: Array<{ Key: string }> | { Key: string };
        Quiet?: boolean | string;
    };
}

export default function S3Handlers_DeleteObjects(router: express.Router) {
    router.post('/:bucket', async (req: express.Request, res) => {
        try {
            // Check if this is a delete request
            if (!req.query.delete) {
                return;
            }

            const { bucket } = req.params;

            // Get bucket
            const bucketObj = await prisma.bucket.findFirst({
                where: {
                    name: bucket
                },
                include: {
                    BucketConfig: true
                }
            });

            if (!bucketObj) {
                return res.status(404).json({
                    message: 'Bucket not found'
                });
            }

            if (bucketObj.access === 'private' || bucketObj.access === 'public-read') {
                const accessKeyId = S3SigV4Auth.extractAccessKeyId(req.headers);

                if (!accessKeyId) {
                    return res.status(401).json({ message: 'Unauthorized' });
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
                    return res.status(401).json({ message: 'Unauthorized' });
                }

                const result = S3SigV4Auth.verifyWithPathDetection(
                    req.method,
                    req.originalUrl,
                    req.path,
                    req.headers,
                    req.body,
                    accessKeyId,
                    credentialsInDb.secretKey
                );

                if (!result.isValid) {
                    return res.status(403).json({ message: 'Invalid signature' });
                }
            }

            // Parse XML body
            const xmlBody = typeof req.body === 'string' ? req.body : req.body.toString();
            
            const parser = new XMLParser({
                ignoreAttributes: false,
                parseTagValue: true
            });

            try {
                const result: DeleteRequest = parser.parse(xmlBody);

                const objects = Array.isArray(result.Delete.Object) 
                    ? result.Delete.Object 
                    : [result.Delete.Object];
                
                const quiet = result.Delete.Quiet === true || result.Delete.Quiet === 'true';
                
                const deleted: Array<{ Key: string }> = [];
                const errors: Array<{ Key: string; Code: string; Message: string }> = [];

                for (const obj of objects) {
                    try {
                        const key = obj.Key;
                        const pathSegments = key.split('/').filter((p: string) => p);

                        const object = await resolvePath(bucketObj.name, pathSegments);

                        if (!object) {
                            if (!quiet) {
                                errors.push({
                                    Key: key,
                                    Code: 'NoSuchKey',
                                    Message: 'The specified key does not exist.'
                                });
                            }
                            continue;
                        }

                        await prisma.object.delete({
                            where: {
                                id: object.id
                            }
                        });

                        // Clean up empty parent folders if configured
                        if (bucketObj.BucketConfig.find(c => c.key === 's3_clear_empty_parents')?.value === 'true' && object.parentId) {
                            const { _count } = await prisma.object.aggregate({
                                where: {
                                    parentId: object.parentId,
                                    bucketId: bucketObj.id
                                },
                                _count: {
                                    id: true
                                }
                            });

                            if (_count.id === 0) {
                                await prisma.object.delete({
                                    where: {
                                        id: object.parentId
                                    }
                                }).catch(() => {});
                            }
                        }

                        await fs.unlink(getObjectPath(bucketObj.name, object.id)).catch(() => {});

                        deleted.push({ Key: key });
                    } catch (error: any) {
                        if (!quiet) {
                            errors.push({
                                Key: obj.Key,
                                Code: 'InternalError',
                                Message: error?.message || 'Internal error'
                            });
                        }
                    }
                }

                // Build XML response
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${deleted.map(d => `
    <Deleted>
        <Key>${d.Key}</Key>
    </Deleted>`).join('')}${errors.map(e => `
    <Error>
        <Key>${e.Key}</Key>
        <Code>${e.Code}</Code>
        <Message>${e.Message}</Message>
    </Error>`).join('')}
</DeleteResult>`;

                res.setHeader('Content-Type', 'application/xml');
                return res.status(200).send(xml);
            } catch (parseError: any) {
                return res.status(400).json({ message: `Invalid XML: ${parseError?.message || parseError}` });
            }

        } catch (err: any) {
            console.error('Error in DeleteObjects handler:', err);
            return res.status(500).json({ message: `Internal server error: ${err?.message || err}` });
        }
    });
}
