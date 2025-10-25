import { Prisma } from "@prisma/client";
import path from "path";
import crypto from "crypto";
import { redis, prisma } from "../worker";

export default class WorkerTools {
    public static async resolvePath(bucketName: string, pathSegments: string[], caching: {
        enabled: boolean;
        ttl: number;
    } = {
            enabled: false,
            ttl: 300,
        }): Promise<Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null> {

        if (caching?.enabled) {
            const pathHash = crypto.createHash('md5').update(`${bucketName}:${pathSegments.join('/')}`).digest('hex');
            const data = await redis.json.get(`object-path-cache:${pathHash}`) as Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null;
            if (data) return {
                ...data,
                size: BigInt(data.size),
                bucket: {
                    ...data.bucket,
                    storageQuota: BigInt(data.bucket.storageQuota),
                }
            };
        }

        let currentParentId: string | null = null;
        let result: Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null = null;

        for (const segment of pathSegments) {
            const foundObject: Prisma.ObjectGetPayload<{ include: { bucket: true } }> | null = await prisma.object.findFirst({
                where: {
                    bucket: { name: bucketName },
                    filename: segment,
                    parentId: currentParentId,
                },
                include: { bucket: true },
            });

            if (!foundObject) return null;

            result = foundObject;
            if (foundObject.mimeType === 'folder') currentParentId = foundObject.id;
        }

        if (caching?.enabled && result) {
            const pathHash = crypto.createHash('md5').update(`${bucketName}:${pathSegments.join('/')}`).digest('hex');
            const res = await Promise.all([
                redis.json.set(`object-path-cache:${pathHash}`, '$', {
                    ...result,
                    size: Number(result.size),
                    bucket: {
                        ...result.bucket,
                        storageQuota: Number(result.bucket.storageQuota),
                    }
                }),
                redis.expire(`object-path-cache:${pathHash}`, caching.ttl)
            ])
        }

        return result;
    }

    public static getObjectPath(bucketName: string, objectId: string): string {
        return path.join(process.cwd(), 'storage', bucketName, objectId);
    }

    public static getStorageDir(): string {
        return path.join(process.cwd(), 'storage');
    }

    public static async ensureWorkerReady(): Promise<void> {
        if (!redis.isOpen) {
            await redis.connect();
        }
    }

    public static async updateStatsInRedis(bucketId: string, stats: Partial<Stats.BucketStatsInRedis>): Promise<void> {
        const key = `bucket:${bucketId}:stats`;
        const increments: Record<string, number> = {};
        const sets: Record<string, any> = {};

        // Separate incrementable fields (like requestsCount) from others
        for (const [field, value] of Object.entries(stats)) {
            if (typeof value === "number") {
                increments[field] = value;
            } else {
                sets[field] = value;
            }
        }

        // Increment fields atomically
        const multi = redis.multi();
        for (const [field, value] of Object.entries(increments)) {
            multi.hIncrBy(key, field, value);
        }
        if (Object.keys(sets).length > 0) {
            multi.hSet(key, sets);
        }
        await multi.exec();
    }

    public static async AuthUser(token?: string) {
        if (!token || token === undefined) return null;

        token = token.split(' ')[token.split(' ').length - 1];

        if (!token) return null;

        const tokenData = await prisma.authTokens.findUnique({
            where: {
                token: token
            },
            include: {
                user: true
            }
        });

        if (!tokenData || !tokenData.user.enabled) return null;

        return {
            user: tokenData.user,
            token: tokenData
        };
    }

    public static async CheckUserQuota(bucket: Prisma.BucketGetPayload<Prisma.BucketDefaultArgs> & { owner: Prisma.UserGetPayload<Prisma.UserDefaultArgs> }, fileSize: number): Promise<boolean> {
        // Check bucket quota
        if (bucket.storageQuota !== BigInt(-1)) {
            const currentUsage = await prisma.object.aggregate({
                where: {
                    bucketId: bucket.id,
                    mimeType: { not: 'folder' },
                },
                _sum: { size: true },
            });

            const usedStorage = currentUsage._sum?.size ? Number(currentUsage._sum.size) : 0;
            const quotaLimit = Number(bucket.storageQuota);

            if (usedStorage + fileSize > quotaLimit) return false;
        }

        // Check user quota
        if (bucket.owner.storageQuota !== BigInt(-1)) {
            const currentUsage = await prisma.object.aggregate({
                where: {
                    bucket: {
                        ownerId: bucket.owner.id,
                    },
                    mimeType: { not: 'folder' },
                },
                _sum: { size: true },
            });

            const usedStorage = currentUsage._sum?.size ? Number(currentUsage._sum.size) : 0;
            const quotaLimit = Number(bucket.owner.storageQuota);

            if (usedStorage + fileSize > quotaLimit) return false;
        }

        return true;
    }
}