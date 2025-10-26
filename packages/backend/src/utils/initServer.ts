import { $Enums } from "@prisma/client";
import { prisma } from "..";
import { HashPW } from "./authLoader";
import { ConfigManager } from "../services/configService";
import fs from 'fs/promises';
import path from 'path';
import selfsigned from 'selfsigned';

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

    console.log("Start Structure checks:")

    process.stdout.write("\n")

    process.stdout.write("Data Directory Present: ")
    const DataDirPresent = await fs.access(path.join(process.cwd(), "data")).then(() => true).catch(() => false);
    if (DataDirPresent) process.stdout.write("OK \n")
    else {
        await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
        process.stdout.write("Created \n")
    }

    process.stdout.write("SSL Directory Present: ")
    const SSLDirPresent = await fs.access(path.join(process.cwd(), "data", "ssl")).then(() => true).catch(() => false);
    if (SSLDirPresent) process.stdout.write("OK \n")
    else {
        await fs.mkdir(path.join(process.cwd(), "data", "ssl"), { recursive: true });
        process.stdout.write("Created \n")
    }

    process.stdout.write("SSL Cert: ")
    const certPath = path.join(process.cwd(), "data", "ssl", "cert.pem");
    const keyPath = path.join(process.cwd(), "data", "ssl", "key.pem");

    const certExists = await fs.access(certPath).then(() => true).catch(() => false);
    const keyExists = await fs.access(keyPath).then(() => true).catch(() => false);

    if (!certExists || !keyExists) {
        const attrs = [{ name: 'commonName', value: 'ByteServe Self-Signed Cert' }];
        const pems = selfsigned.generate(attrs, {
            days: 3650,
            keySize: 2048,
            algorithm: 'sha256'
        });

        await fs.writeFile(certPath, pems.cert);
        await fs.writeFile(keyPath, pems.private);
        process.stdout.write("Created \n")
    } else {
        process.stdout.write("OK \n")
    }

    process.stdout.write("\n")

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
            },
            {
                category: "ssl",
                key: "ssl_renewal_email",
                value: "",
                description: "Email address used for Let's Encrypt SSL certificate renewal",
                type: $Enums.ConfigType.STRING,
                selectOptions: [],
            },
            {
                category: "ssl",
                key: "ssl_cert_renewal_domains",
                value: "",
                description: "Comma-separated list of domains for Let's Encrypt SSL certificate renewal",
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
            },
            {
                id: "report_hourly_stats",
                displayName: "Report Hourly Stats",
                cron: "59 * * * *", // Every hour at minute 59
                enabled: true
            },
            {
                id: "ssl_cert_renewal",
                displayName: "SSL Certificate Renewal",
                cron: "0 0 * * *", // Every day at midnight
                enabled: false
            }
        ],
        skipDuplicates: true,
    })
    process.stdout.write("OK \n")

    process.stdout.write("\n")
    console.log("Database checks complete.")

    // Initialize Config Manager
    new ConfigManager();
}