import express from 'express';
import { prisma, redis } from '../fork';
import { getObjectPath, resolvePath } from '../common/object-nesting';
import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';
import { updateStatsInRedis } from '../common/stats';

const router = express.Router();

router.get('/:bucket{/*objectPath}', async (req: express.Request, res) => {
    try {
        const { bucket } = req.params;
        const objectPathParam = (req.params as any).objectPath || [];
        const objectPath = Array.isArray(objectPathParam) ? objectPathParam.filter(segment => segment !== '') : [];

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
            return res.status(404).send('Bucket not found');
        }

        if (bucketObj.BucketConfig.find(c => c.key === 'files_image_transform_enable')?.value !== 'true') {
            return res.status(403).send('Image transformation is disabled for this bucket');
        }

        if (bucketObj.access === 'private') {
            const token = (req.query.token || (req.headers['authorization'] || "Bearer ").split(" ")[1]) as string | undefined;

            if (!token) return res.status(401).send('Unauthorized');

            const credentialsInDb = await prisma.authTokens.findUnique({
                where: {
                    token: token,
                    isApi: true,
                    user: {
                        Bucket: {
                            some: { id: bucketObj.id }
                        }
                    }
                },
                include: {
                    user: true
                }
            })

            if (!credentialsInDb) {
                return res.status(401).send('Unauthorized');
            }
        }

        const object = await resolvePath(bucketObj.name, objectPath, {
            enabled: bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_enable')?.value === 'true',
            ttl: parseInt(bucketObj.BucketConfig.find(c => c.key === 'cache_path_caching_ttl_seconds')?.value || '300', 10),
        });

        if (!object) {
            return res.status(404).send('Object not found');
        }

        if (!["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"].includes(object.mimeType || "")) {
            return res.status(400).send('Unsupported image type for transformation');
        }

        const cacheEnabled = bucketObj.BucketConfig.find(c => c.key === 'files_image_transform_cache_enable')?.value === 'true';
        const cacheTtl = parseInt(bucketObj.BucketConfig.find(c => c.key === 'files_image_transform_cache_ttl_seconds')?.value || '300', 10);
        const cacheMaxSize = parseInt(bucketObj.BucketConfig.find(c => c.key === 'files_image_transform_cache_max_size')?.value || '10', 10) * 1024 * 1024;

        const width = req.query.width ? parseInt(req.query.width as string, 10) : null;
        const height = req.query.height ? parseInt(req.query.height as string, 10) : null;
        const format = req.query.format ? (req.query.format as string) : null;
        const quality = req.query.quality ? Math.min(100, Math.max(1, parseInt(req.query.quality as string, 10))) : 80;

        if (cacheEnabled) {
            const cacheId = crypto.createHash('md5')
                .update(`${object.id}:w${width || 'auto'}:h${height || 'auto'}:f${format || 'orig'}:q${quality}`)
                .digest('hex');
            const cacheKey = `image_transform_cache:${cacheId}`;
            const cachedData = await redis.get(cacheKey)
            if (cachedData) {
                res.setHeader('Content-Type', `image/${format || object.mimeType?.split('/')[1] || 'jpeg'}`);
                res.setHeader('X-Cache', 'HIT');
                res.status(200).send(Buffer.from(cachedData, 'binary'));

                updateStatsInRedis(bucketObj.id, {
                    requestsCount: 1,
                    bytesServed: Number(object.size) || 0,
                    apiRequestsServed: 1
                });

                return;
            }
        }

        sharp.cache({ files: 0, memory: 0, items: 0 }); // Disable sharp cache to save memory

        const outputFormat = format as keyof sharp.FormatEnum || object.mimeType?.split('/')[1] as keyof sharp.FormatEnum || 'jpeg';
        const outputPipeline = sharp()
            .rotate()
            .resize(width || undefined, height || undefined)
            .toFormat(outputFormat, {
                quality: ['jpeg', 'jpg', 'webp'].includes(outputFormat) ? quality : undefined
            });


        // Optimize socket for high-throughput
        if (res.socket) {
            res.socket.setKeepAlive(true, 60000);
            res.socket.setNoDelay(true);

            // Increase socket buffer sizes for high-throughput (16MB based on benchmark results)
            try {
                // @ts-ignore - these methods exist but aren't in the types
                if (res.socket.setRecvBufferSize) res.socket.setRecvBufferSize(16 * 1024 * 1024);
                // @ts-ignore
                if (res.socket.setSendBufferSize) res.socket.setSendBufferSize(16 * 1024 * 1024);
            } catch (e) {
                // Ignore if not supported
            }
        }

        if(cacheEnabled) res.setHeader('X-Cache', 'MISS');
        res.setHeader('Content-Type', `image/${format || object.mimeType?.split('/')[1] || 'jpeg'}`);

        const readStream = fs.createReadStream(getObjectPath(bucketObj.name, object.id), {
            highWaterMark: 4 * 1024 * 1024 // 4MB chunk size
        });

        const redisBuffer: Buffer[] | null = (cacheEnabled && object.size <= cacheMaxSize) ? [] : null;

        readStream
            .pipe(outputPipeline)
            .on('error', (err) => {
                console.error('Error during image transformation:', err);
                res.status(500).send('Internal Server Error: ' + err.message);
            })
            .on('data', (chunk) => {
                if(!redisBuffer) return;

                redisBuffer?.push(chunk);
            })
            .pipe(res);

        await new Promise((resolve, reject) => {
            outputPipeline.on('end', resolve);
            outputPipeline.on('error', reject);
        });

        res.status(200);
        
        readStream.close();

        updateStatsInRedis(bucketObj.id, {
            requestsCount: 1,
            bytesServed: Number(object.size) || 0,
            apiRequestsServed: 1
        })

        if (cacheEnabled && redisBuffer) {
            const buffer = Buffer.concat(redisBuffer);

            if(buffer.length >= cacheMaxSize) return;
            const cacheId = crypto.createHash('md5')
                .update(`${object.id}:w${width || 'auto'}:h${height || 'auto'}:f${format || 'orig'}:q${quality}`)
                .digest('hex');
            const cacheKey = `image_transform_cache:${cacheId}`;
            await redis.set(cacheKey, Buffer.concat(redisBuffer).toString('binary'), {
                EX: cacheTtl
            });
        }
    } catch (error) {
        console.error('Error in GetObject handler:', error);
        res.status(500).send('Internal Server Error: ' + (error as Error).message);
    }
});

export default router;