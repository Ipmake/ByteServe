import { randomUUID } from "crypto";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "..";

export const multerStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'storage', '.temp');
    await fs.promises.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Use a temporary unique filename
    cb(null, `${randomUUID()}-${file.originalname}`);
  },
});

export async function CheckUserQuota(bucket: Prisma.BucketGetPayload<Prisma.BucketDefaultArgs> & { owner: Prisma.UserGetPayload<Prisma.UserDefaultArgs> }, fileSize: number): Promise<boolean> {
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