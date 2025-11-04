import express from 'express';  
import { AuthLoader } from '../utils/authLoader';
import { prisma, redis } from '../fork';

const router = express.Router();    

router.use(express.json({ limit: '50mb' }));

router.get('/me', AuthLoader, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { user, token } = req.user;

    // Get all bucket stats hourly stats for the past 30 days
    const stats = await prisma.bucketStatsTimeSeries.findMany({
        where: {
            timestamp: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
            },
            bucket: {
                ownerId: user.id
            }
        },
        orderBy: {
            timestamp: 'desc' // Get latest stats first
        }
    });

    // Temporary structure to hold daily stats and helper for absolute values
    const dailyStats: Record<string, Stats.DailyUserBucketStats & { _latestBucketStats?: Record<string, { usedSpace: number, objectCount: number }> }> = {};

    // Initialize all 30 days
    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        dailyStats[dayKey] = {
            bytesServed: Number(0),
            requestsCount: Number(0),
            apiRequestsCount: Number(0),
            s3RequestsCount: Number(0),
            webdavRequestsCount: Number(0),
            usedSpace: Number(0), // Will be calculated after the loop
            objectCount: Number(0), // Will be calculated after the loop
            _latestBucketStats: {} // Helper to track latest stat per bucket
        };
    }

    // Process the stats from the database
    for (const stat of stats) {
        const dayKey = stat.timestamp.toISOString().split('T')[0];

        // Ensure the day is in our initialized map
        if (!dailyStats[dayKey]) {
            continue; // Should not happen with the 30-day init, but good safeguard
        }

        // 1. Sum up delta-based stats
        dailyStats[dayKey].bytesServed += Number(stat.bytesServed);
        dailyStats[dayKey].requestsCount += Number(stat.requestsCount);
        dailyStats[dayKey].apiRequestsCount += Number(stat.apiRequestsCount);
        dailyStats[dayKey].s3RequestsCount += Number(stat.s3RequestsCount);
        dailyStats[dayKey].webdavRequestsCount += Number(stat.webdavRequestsCount);

        // 2. Store the latest absolute stats for each bucket
        // Since we ordered by `timestamp: 'desc'`, the *first* time we
        // see a bucketId for a given day is its latest stat for that day.
        if (dailyStats[dayKey]._latestBucketStats && !dailyStats[dayKey]._latestBucketStats![stat.bucketId]) {
            dailyStats[dayKey]._latestBucketStats![stat.bucketId] = {
                usedSpace: Number(stat.usedSpace),
                objectCount: Number(stat.objectCount)
            };
        }
    }

    // 3. Post-processing: Sum up the absolute stats and clean up the helper
    for (const dayKey in dailyStats) {
        const day = dailyStats[dayKey];
        let totalUsedSpace = 0;
        let totalObjectCount = 0;
        
        if (day._latestBucketStats) {
            for (const bucketId in day._latestBucketStats) {
                totalUsedSpace += day._latestBucketStats[bucketId].usedSpace;
                totalObjectCount += day._latestBucketStats[bucketId].objectCount;
            }
        }
        
        day.usedSpace = totalUsedSpace;
        day.objectCount = totalObjectCount;
        
        delete day._latestBucketStats; // Cleanup helper
    }

    // 4. Add "today's" stats from Redis (logic unchanged from original)
    // This logic assumes Redis only provides *deltas* for today,
    // and the `usedSpace`/`objectCount` from the last DB entry is sufficient.
    const buckets = await prisma.bucket.findMany({
        where: {
            ownerId: user.id
        }
    });

    const todayKey = new Date().toISOString().split('T')[0];
    if (dailyStats[todayKey]) { // Ensure today is initialized
        for (const bucket of buckets) {
            const statsInRedis: Stats.BucketStatsInRedis | null = await redis.hGetAll(`bucket:${bucket.id}:stats`) as any;
            if (!statsInRedis) continue; 
            
            // Add delta stats from Redis
            dailyStats[todayKey].bytesServed += Number(statsInRedis.bytesServed || 0);
            dailyStats[todayKey].requestsCount += Number(statsInRedis.requestsCount || 0);
            dailyStats[todayKey].apiRequestsCount += Number(statsInRedis.apiRequestsServed || 0);
            dailyStats[todayKey].s3RequestsCount += Number(statsInRedis.s3RequestsServed || 0);
            dailyStats[todayKey].webdavRequestsCount += Number(statsInRedis.webdavRequestsServed || 0);
        }
    }

    res.json(dailyStats as Record<string, Stats.DailyUserBucketStats>);
});

export default router;