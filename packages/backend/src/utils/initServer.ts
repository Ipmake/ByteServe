import { $Enums } from "@prisma/client";
import { prisma } from "..";
import { HashPW } from "./authLoader";
import { ConfigManager } from "../services/configService";

export async function Init() {

    // Initialize database connections
    await prisma.$connect();

    try {
        await prisma.$executeRaw`CREATE PUBLICATION alltables FOR ALL TABLES`;
    } catch (error: any) {
        // Publication already exists, ignore the error
        if (!error.message?.includes('already exists')) {
            throw error;
        }
    }

    await prisma.$transaction([
        prisma.$executeRawUnsafe(`
            DROP INDEX IF EXISTS "Object_bucketId_parentId_filename_key";
        `),
        prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX "Object_bucketId_parentId_filename_key"
            ON public."Object" (
                "bucketId",
                COALESCE("parentId", '__NULL__'),
                "filename"
            );
        `)
    ]);

    console.log("Start Database checks: ")

    process.stdout.write("\n")

    process.stdout.write("Config Present: ")

    await prisma.config.createMany({
        data: [
            {
                key: "site_name",
                value: "ByteServe Server",
                description: "The name of the site displayed in the UI",
                type: $Enums.ConfigType.STRING,
                selectOptions: [],
            }
        ],
        skipDuplicates: true,
    })

    process.stdout.write("OK \n")

    process.stdout.write("Admin Present: ")
    if ((await prisma.user.count({
        where: {
            isAdmin: true
        }
    })) === 0) {
        const NewUser = await prisma.user.create({
            data: {
                username: "admin",
                password: HashPW(HashPW("admin")),
                isAdmin: true
            }
        })

        console.log("\n --- New Admin User Created ---")

        console.log(`Username: ${NewUser.username}`)
        console.log(`Password: admin`)

        console.log("--- New Admin User Created ---")
        console.log("These credentials will not be shown again.")
    } else {
        process.stdout.write("OK \n")
    }

    process.stdout.write("Schedule Tasks Present: ")
    if ((await prisma.scheduleTask.count()) !== 2) {
        await prisma.scheduleTask.deleteMany({})

        await prisma.scheduleTask.createMany({
            data: [
                {
                    id: "purge_old_objects",
                    displayName: "Purge Old Objects",
                    cron: "0 0 * * *", // Every day at midnight
                    enabled: true
                },
                {
                    id: "purge_expired_tokens",
                    displayName: "Purge Expired Tokens",
                    cron: "0 * * * *", // Every hour
                    enabled: true
                }
            ]
        })
        process.stdout.write("Created \n")
    } else {
        process.stdout.write("OK \n")
    }

    process.stdout.write("\n")
    console.log("Database checks complete.")

    // Initialize Config Manager
    new ConfigManager();
}