import { Prisma } from "@prisma/client";
import { prisma } from "..";
import path from "path";

export async function resolvePath(bucketName: string, pathSegments: string[]): Promise<Prisma.ObjectGetPayload<Prisma.ObjectDefaultArgs> | null> {
  let currentParentId: string | null = null;
  let result: Prisma.ObjectGetPayload<Prisma.ObjectDefaultArgs> | null = null;

  for (const segment of pathSegments) {
    const foundObject: Prisma.ObjectGetPayload<Prisma.ObjectDefaultArgs> | null = await prisma.object.findFirst({
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

  return result;
}

export function getObjectPath(bucketName: string, objectId: string): string {
  return path.join(process.cwd(), 'storage', bucketName, objectId);
}