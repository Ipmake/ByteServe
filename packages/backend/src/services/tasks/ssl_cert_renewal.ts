import path from "path";
import { prisma } from "../..";
import fs from "fs/promises";
import { httpsServer } from "../../server";

export default async function ssl_cert_renewal() {
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

    const Greenlock = (await import("greenlock")).default;

    const greenlock = Greenlock.create({
        version: 'draft-12',
        configDir: path.join(__dirname, "data", "ssl", ".config"),
        maintainerEmail: email,
        store: require('greenlock-store-fs'),
        challenges: {
            'http-01': require('le-challenge-fs').create({
                webroot: path.join(__dirname, "data", "ssl", ".well-known", "acme-challenge"),
                debug: true
            })
        },
        debug: true,
        // IMPORTANT: This tells Greenlock to skip HTTPS validation during challenge
        agreeToTerms: true,
        communityMember: false,
        // Skip TLS verification for local/staging environments
        skipChallengeTests: true,
        skipDryRun: false
    });

    const certs = await greenlock.register({
        domains: domains,
        email: email,
        agreeTos: true,
        challengeType: "http-01",
        communityMember: false,
    });


    const certPath = path.join(__dirname, "data", "ssl", "cert.pem");
    const keyPath = path.join(__dirname, "data", "ssl", "key.pem");

    await fs.writeFile(certPath, certs.cert);
    await fs.writeFile(keyPath, certs.privkey);

    httpsServer?.setSecureContext({
        key: certs.privkey,
        cert: certs.cert,
    });

    console.log("SSL certificate renewal completed successfully.");
}