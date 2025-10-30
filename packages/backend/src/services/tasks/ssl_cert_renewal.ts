import path from "path";
import { prisma, redis } from "../../";
import fs from "fs/promises";
import acme from "acme-client";

export default async function ssl_cert_renewal() {
    if (!redis || !prisma) throw new Error("Redis or Prisma not initialized");

    const config = await prisma.config.findMany({
        where: {
            category: "ssl",
            key: {
                in: ["ssl_renewal_email", "ssl_cert_renewal_domains"]
            }
        }
    });

    const emailConfig = config.find(c => c.key === "ssl_renewal_email");
    const domainsConfig = config.find(c => c.key === "ssl_cert_renewal_domains");

    if (!emailConfig?.value || !domainsConfig?.value) {
        console.log("SSL certificate renewal skipped: Missing configuration.");
        return;
    }

    const email = emailConfig.value;
    const domains = domainsConfig.value.split(",").map(d => d.trim()).filter(d => d.length > 0);

    if (domains.length === 0) {
        console.log("SSL certificate renewal skipped: No domains specified.");
        return;
    }

    console.log(`Starting SSL certificate renewal for domains: ${domains.join(", ")}`);

    const isProduction = process.env.NODE_ENV === "production";
    const acmeDirectoryUrl = isProduction
        ? acme.directory.letsencrypt.production
        : acme.directory.letsencrypt.staging;
    const certBaseDir = path.join(process.cwd(), "data", "ssl");

    // Directory for challenge files
    const challengeDir = path.join(certBaseDir, ".well-known", "acme-challenge");
    await fs.mkdir(challengeDir, { recursive: true });

    const client = new acme.Client({
        directoryUrl: acmeDirectoryUrl,
        accountKey: await acme.forge.createPrivateKey()
    });

    // Register account if needed
    await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${email}`]
    });

    // Create certificate order
    const order = await client.createOrder({ identifiers: domains.map(d => ({ type: "dns", value: d })) });

    // Get authorizations and complete challenges
    const authorizations = await client.getAuthorizations(order);
    for (const authz of authorizations as acme.Authorization[]) {
        const challenge = authz.challenges.find((c) => c.type === "http-01");
        if (!challenge) throw new Error("No http-01 challenge found for domain " + authz.identifier.value);

        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

        // Inline challenge file creation
        const filePath = path.join(challengeDir, challenge.token);
        await fs.writeFile(filePath, keyAuthorization, "utf8");
        try {
            await client.verifyChallenge(authz, challenge);
            await client.completeChallenge(challenge);
            await client.waitForValidStatus(challenge);
        } finally {
            // Inline challenge file removal
            await fs.unlink(filePath).catch(() => {});
        }
    }

    // Generate CSR and finalize order
    const [key, csr] = await acme.forge.createCsr({
        commonName: domains[0],
        altNames: domains
    });
    await client.finalizeOrder(order, csr);

    // Get certificate
    const cert = await client.getCertificate(order);

    // Save cert and key
    const certPath = path.join(certBaseDir, "cert.pem");
    const keyPath = path.join(certBaseDir, "key.pem");
    await fs.writeFile(certPath, cert);
    await fs.writeFile(keyPath, key);

    redis.publish("cert_update", "new_cert");

    console.log("SSL certificate renewal completed successfully.");

    await prisma.scheduleTask.update({
        where: {
            id: "ssl_cert_renewal"
        },
        data: {
            lastRun: new Date()
        }
    });
}