import express from 'express';  
import { AuthLoader } from '../utils/authLoader';
import { prisma, redis } from '..';

const router = express.Router();    

router.get('/me', AuthLoader, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;

    // Get all bucket stats hourly stats for the past 30 days and aggregate them by day
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
            timestamp: 'desc'
        }
    });

    // bundle them up per day and fill missing days with zeros
    const dailyStats: Record<string, Stats.DailyUserBucketStats> = {};
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
            usedSpace: Number(0),
            objectCount: Number(0),
        };
    }

    for (const stat of stats) {
        const dayKey = stat.timestamp.toISOString().split('T')[0];
        if (!dailyStats[dayKey]) {
            dailyStats[dayKey] = {
                bytesServed: Number(0),
                requestsCount: Number(0),
                apiRequestsCount: Number(0),
                s3RequestsCount: Number(0),
                webdavRequestsCount: Number(0),
                usedSpace: Number(0),
                objectCount: Number(0),
            };
        }
        dailyStats[dayKey].bytesServed += Number(stat.bytesServed);
        dailyStats[dayKey].requestsCount += Number(stat.requestsCount);
        dailyStats[dayKey].apiRequestsCount += Number(stat.apiRequestsCount);
        dailyStats[dayKey].s3RequestsCount += Number(stat.s3RequestsCount);
        dailyStats[dayKey].webdavRequestsCount += Number(stat.webdavRequestsCount);
        dailyStats[dayKey].usedSpace = Number(stat.usedSpace);
        dailyStats[dayKey].objectCount = Number(stat.objectCount);
    }

    const buckets = await prisma.bucket.findMany({
        where: {
            ownerId: user.id
        }
    })

    for (const bucket of buckets) {
        const todayKey = new Date().toISOString().split('T')[0];
        
        const statsInRedis: Stats.BucketStatsInRedis | null = await redis.hGetAll(`bucket:${bucket.id}:stats`) as any;
        if (!statsInRedis) continue; 

        dailyStats[todayKey].bytesServed += Number(statsInRedis.bytesServed || 0);
        dailyStats[todayKey].requestsCount += Number(statsInRedis.requestsCount || 0);
        dailyStats[todayKey].apiRequestsCount += Number(statsInRedis.apiRequestsServed || 0);
        dailyStats[todayKey].s3RequestsCount += Number(statsInRedis.s3RequestsServed || 0);
        dailyStats[todayKey].webdavRequestsCount += Number(statsInRedis.webdavRequestsServed || 0);
    }


    res.json(dailyStats as Record<string, Stats.DailyUserBucketStats>);
});

export default router;