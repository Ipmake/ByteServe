import { prisma } from "../../";
import StaticVars from "../../common/static";

export default async function migrationRunConfPopulation() {
    if (!prisma) throw new Error("Redis or Prisma not initialized");

    const buckets = await prisma.bucket.findMany({
        include: {
            BucketConfig: true
        }
    });

    // split into chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < buckets.length; i += chunkSize) {
        const chunk = buckets.slice(i, i + chunkSize);

        await prisma.$transaction(
            chunk.map(bucket => {
                if (!prisma) throw new Error("Redis or Prisma not initialized");

                return prisma.bucketConfig.createMany({
                    data: StaticVars.Bucket_Config_Default.map(config => ({
                        ...config,
                        bucketId: bucket.id,
                    })),
                    skipDuplicates: true,
                });
            })
        )
    }

    // await prisma.bucketConfig.deleteMany({
    //     where: {
    //         key: {
    //             notIn: StaticVars.Bucket_Config_Default.map(c => c.key)
    //         }
    //     }
    // });

    await prisma.scheduleTask.update({
        where: { id: 'migration_run_confpopulation' },
        data: { lastRun: new Date() },
    }).catch((err) => {
        console.error('Error updating lastRun for migration_run_confpopulation:', err);
    });

    console.log('Migration run: Bucket configuration population completed.');
}