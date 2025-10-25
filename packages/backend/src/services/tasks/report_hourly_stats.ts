import { prisma, redis, workerPool } from "../..";

export default async function reportHourlyStats() {
    const now = new Date();
    now.setMinutes(0, 0, 0); // Round down to the current hour

    // get multiple keys from redis. Scan for keys matching bucket:*:stats
    const keys = await redis.keys('bucket:*:stats');

    for (const key of keys) {
        const bucketId = key.split(':')[1];
        const stats: Stats.BucketStatsInRedis = await redis.hGetAll(key) as any;

        // Convert string values to numbers
        const BytesServed = BigInt(stats.bytesServed || '0');
        const RequestCount = BigInt(stats.requestsCount || '0');

        const ApiRequests = BigInt(stats.apiRequestsServed || '0');
        const S3Requests = BigInt(stats.s3RequestsServed || '0');
        const WebDAVRequests = BigInt(stats.webdavRequestsServed || '0');


        const bucketAgregates = await prisma.object.aggregate({
            where: { bucketId },
            _sum: {
                size: true,
            },
            _count: {
                id: true,
            },
        });

        const usedSpace = bucketAgregates._sum.size || BigInt(0);
        const objectCount = BigInt(bucketAgregates._count.id || 0);

        // Insert into BucketStatsTimeSeries
        await prisma.bucketStatsTimeSeries.upsert({
            where: {
                bucketId_timestamp: {
                    bucketId,
                    timestamp: now,
                },
            },
            create: {
                bytesServed: BytesServed,
                requestsCount: RequestCount,
                apiRequestsCount: ApiRequests,
                s3RequestsCount: S3Requests,
                webdavRequestsCount: WebDAVRequests,

                usedSpace,
                objectCount,

                bucketId,
                timestamp: now,
            },
            update: {
                bytesServed: { increment: BytesServed },
                requestsCount: { increment: RequestCount },
                apiRequestsCount: { increment: ApiRequests },
                s3RequestsCount: { increment: S3Requests },
                webdavRequestsCount: { increment: WebDAVRequests },

                usedSpace,
                objectCount,
            },
        });

        // Reset stats in redis
        await redis.hSet(key, {
            apiRequestsServed: 0,
            s3RequestsServed: 0,
            webdavRequestsServed: 0,
            bytesServed: 0,
            requestsCount: 0,
        });
    }


    await prisma.serverStatsTimeSeries.create({
        data: {
            diskUsedBytes: BigInt(0), // Placeholder, implement actual disk usage calculation if needed
            diskTotalBytes: BigInt(0), // Placeholder, implement actual disk usage calculation if needed

            memoryTotalBytes: BigInt(0), // Placeholder, implement actual memory usage calculation if needed
            memoryUsedBytes: BigInt(0), // Placeholder, implement actual memory usage calculation if needed

            cpuUsedPercent: 0, // Placeholder, implement actual CPU usage calculation if needed

            requestsServed: 0, // Placeholder, implement actual request counting if needed

            workerCount: workerPool.threads.length,
            utilizationPercent: Number.parseFloat((workerPool.utilization * 100).toFixed(2)),

            timestamp: now,
        },
    });

    await prisma.scheduleTask.update({
        where: { id: 'report_hourly_stats' },
        data: { lastRun: new Date() },
    }).catch((err) => {
        console.error('Error updating lastRun for report_hourly_stats:', err);
    });

    console.log(`Reported hourly stats.`);
}