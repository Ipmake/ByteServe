import { redis } from "..";

export async function updateStatsInRedis(bucketId: string, stats: Partial<Stats.BucketStatsInRedis>): Promise<void> {
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