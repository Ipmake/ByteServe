import { Prisma } from "@prisma/client";
import { prisma, redis } from "../fork";
import path from "path";
import crypto from "crypto";

export async function resolvePath(bucketName: string, pathSegments: string[], caching: {
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

export function getObjectPath(bucketName: string, objectId: string): string {
  return path.join(getStorageDir(), bucketName, objectId);
}

export function getStorageDir(): string {
  return path.join(process.cwd(), 'storage');
}