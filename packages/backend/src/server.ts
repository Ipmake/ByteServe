import path from 'path';
import fs from 'fs/promises';
import { app } from './';
import express from 'express';
import { Init } from './utils/initServer';
import ScheduledTasksService from './services/scheduledTasks';
import { getStorageDir } from './common/object-nesting';

import http from 'http';
import https from 'https';

export let httpServer: http.Server | null = null;
export let httpsServer: https.Server | null = null;

export async function startServer(port: number | string) {
    await Init();

    const __dirname = process.cwd();
    const routesDir = path.join(__dirname, 'dist', 'routes');
    const wwwDir = path.join(__dirname, 'www');

    try {
        // Ensure routes directory exists
        await fs.mkdir(routesDir, { recursive: true }).catch(() => { });

        // Enable CORS for all requests
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Depth, User-Agent, X-File-Size, X-Requested-With, If-Modified-Since, X-File-Name, Cache-Control');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
            res.header('Access-Control-Expose-Headers', 'DAV, content-length, Allow');
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // WebDAV server is already set up in index.ts before body parsing

        // Register API routes
        const { registerRoutes } = await import('./utils/routeloader.js');
        await registerRoutes(app, routesDir, '/api');

        const scheduledTasksService = new ScheduledTasksService();

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
            console.log('www directory not found, skipping static file serving');

            // Just handle API routes if no frontend
            app.use((req, res, next) => {
                if (req.path.startsWith('/api/')) return next();
                if (req.path.startsWith('/dav')) return next();
                if (req.path.startsWith('/s3')) return next();
                res.status(404).json({ error: 'Route not found' });
            });
        }

        // Clean .temp directory on startup
        console.log('Cleaning temporary files...');
        const tempDir = path.join(getStorageDir(), '.temp');
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(tempDir, { recursive: true }).catch(() => { });
        console.log('Temporary files cleaned.');

        httpServer = http.createServer(app);
        httpsServer = https.createServer({
            key: await fs.readFile(path.join(__dirname, 'data', 'ssl', 'key.pem')),
            cert: await fs.readFile(path.join(__dirname, 'data', 'ssl', 'cert.pem')),
        }, app);

        httpServer.listen(80);
        httpsServer.listen(443);
    } catch (err) {
        console.error('Failed to start server:', err);
        throw err;
    }
}