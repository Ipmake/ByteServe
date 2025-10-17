import { prisma } from "../..";

export default async function purgeExpiredTokens() {
    const now = new Date();
    const result = await prisma.authTokens.deleteMany({
        where: {
            expiresAt: {
                lt: now,
            },
        },
    });

    await prisma.scheduleTask.update({
        where: { id: 'purge_expired_tokens' },
        data: { lastRun: new Date() },
    }).catch((err) => {
        console.error('Error updating lastRun for purge_expired_tokens:', err);
    });

    console.log(`Purged ${result.count} expired auth tokens.`);
}