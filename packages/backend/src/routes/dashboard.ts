import express, { Request, Response } from 'express';
import { AuthUser } from '../utils/authLoader';
import { prisma } from '..';

const router = express.Router();

router.get('/stats', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);
        
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Get all buckets for the user
        const buckets = await prisma.bucket.findMany({
            where: {
                ownerId: user.user.id,
            },
            select: {
                id: true,
                name: true,
                access: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 5, // Only get 5 most recent for the table
        });

        // Get total bucket count
        const totalBuckets = await prisma.bucket.count({
            where: {
                ownerId: user.user.id,
            },
        });

        // Get total object count and total size
        const objectStats = await prisma.object.aggregate({
            where: {
                bucket: {
                    ownerId: user.user.id,
                },
                mimeType: {
                    not: 'folder',
                },
            },
            _count: true,
            _sum: {
                size: true,
            },
        });

        // Get object counts for recent buckets
        const recentBucketsWithCounts = await Promise.all(
            buckets.map(async (bucket) => {
                const objectCount = await prisma.object.count({
                    where: {
                        bucketId: bucket.id,
                    },
                });
                
                return {
                    ...bucket,
                    objectCount,
                };
            })
        );

        // Get total users (admin only)
        let totalUsers = 0;
        if (user.user.isAdmin) {
            totalUsers = await prisma.user.count();
        }

        res.json({
            totalBuckets,
            totalUsers,
            totalObjects: objectStats._count || 0,
            totalSize: objectStats._sum?.size ? Number(objectStats._sum.size) : 0,
            storageQuota: Number(user.user.storageQuota),
            recentBuckets: recentBucketsWithCounts,
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

export default router;
