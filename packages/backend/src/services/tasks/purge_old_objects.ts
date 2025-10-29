import { prisma } from "../..";
import fs from "fs";
import path from "path";
import { getStorageDir } from "../../common/object-nesting";

export default async function purgeOldObjects() {
    const dbObjects = await prisma.object.findMany({
        include: {
            bucket: true
        }
    })

    const objectsMap = new Map<string, string>();
    for (const obj of dbObjects) {
        objectsMap.set(obj.id, obj.bucket.name);
    }

    let purgedCount = 0;

    // scan the storage directory find all objects within their buckets
    const storageDir = getStorageDir();
    const bucketDirs = await fs.promises.readdir(storageDir);

    for (const bucketName of bucketDirs) {
        const bucketPath = path.join(storageDir, bucketName);
        const objectFiles = await fs.promises.readdir(bucketPath);

        for (const objectFile of objectFiles) {
            const objectId = path.parse(objectFile).name;

            // Check if the object exists in the database
            if (!objectsMap.has(objectId) || objectsMap.get(objectId) !== bucketName) {
                // Object does not exist in DB, delete the file
                const objectFilePath = path.join(bucketPath, objectFile);
                await fs.promises.unlink(objectFilePath);
                purgedCount++;
            }
        }
    }

    await prisma.scheduleTask.update({
        where: { id: 'purge_old_objects' },
        data: { lastRun: new Date() },
    }).catch((err) => {
        console.error('Error updating lastRun for purge_old_objects:', err);
    });

    console.log(`Purged ${purgedCount} old object(s)`);
}