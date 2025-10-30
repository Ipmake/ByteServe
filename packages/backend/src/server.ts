import path from 'path';
import fs from 'fs/promises';
import { app, redis } from './fork';
import express from 'express';
import { getStorageDir } from './common/object-nesting';
import { ConfigManager } from './services/configService';

import http from 'http';
import https from 'https';

export let httpServer: http.Server | null = null;
export let httpsServer: https.Server | null = null;

export async function startServer(port: number | string) {
    const configManager = new ConfigManager();

    const __dirname = process.cwd();
    const routesDir = path.join(__dirname, 'dist', 'routes');
    const wwwDir = path.join(__dirname, 'www');

    try {
        // Ensure routes directory exists
        await fs.mkdir(routesDir, { recursive: true }).catch(() => { });

        // Enable CORS for all requests
        app.use((req, res, next) => {
            if (ConfigManager.Config["ssl_redirect_http"] === "true" && !req.secure) {
                const host = req.headers.host;
                const redirectUrl = `https://${host}${req.url}`;
                return res.redirect(301, redirectUrl);
            }

            next();
        });

        // WebDAV server is already set up in index.ts before body parsing

        // Register API routes
        const { registerRoutes } = await import('./utils/routeloader.js');
        await registerRoutes(app, routesDir, '/api');

        // Check if www directory exists
        try {
            await fs.access(wwwDir);
            app.use(express.static(wwwDir));

            // For any other requests, send index.html for SPA routing
            app.use((req, res, next) => {
                if (req.path.startsWith('/api/')) return next();
                if (req.path.startsWith('/dav')) return next();
                if (req.path.startsWith('/s3')) return next();
                const indexPath = path.join(wwwDir, 'index.html');
                res.sendFile(indexPath, (err) => {
                    if (err) {
                        res.status(404).send('Frontend not found');
                    }
                });
            });
        } catch {
            // Just handle API routes if no frontend
            app.use((req, res, next) => {
                if (req.path.startsWith('/api/')) return next();
                if (req.path.startsWith('/dav')) return next();
                if (req.path.startsWith('/s3')) return next();
                res.status(404).json({ error: 'Route not found' });
            });
        }

        httpServer = http.createServer({
            highWaterMark: 1024 * 1024 * 1, // 1MB buffer size
            noDelay: true,
            keepAlive: true,
            keepAliveTimeout: 60000,
            keepAliveInitialDelay: 30000,
            maxHeaderSize: 64 * 1024, // 64KB
        }, app);
        httpsServer = https.createServer({
            key: await fs.readFile(path.join(__dirname, 'data', 'ssl', 'key.pem')),
            cert: await fs.readFile(path.join(__dirname, 'data', 'ssl', 'cert.pem')),

            highWaterMark: 1024 * 1024 * 1, // 1MB buffer size
            noDelay: true,
            keepAlive: true,
            keepAliveTimeout: 60000,
            keepAliveInitialDelay: 30000,
            maxHeaderSize: 64 * 1024, // 64KB
        }, app);

        const pubRedis = redis.duplicate();
        await pubRedis.connect();

        pubRedis.subscribe('cert_update', async (message) => {
            console.log('Received cert_update message, reloading SSL certificates...');
            try {
                const newKey = await fs.readFile(path.join(__dirname, 'data', 'ssl', 'key.pem'));
                const newCert = await fs.readFile(path.join(__dirname, 'data', 'ssl', 'cert.pem'));

                httpsServer?.setSecureContext({
                    key: newKey,
                    cert: newCert
                });

                console.log('SSL certificates reloaded successfully.');
            } catch (err) {
                console.error('Failed to reload SSL certificates:', err);
            }
        });

        httpServer.listen(80);
        httpsServer.listen(443);
    } catch (err) {
        console.error('Failed to start server:', err);
        throw err;
    }
}