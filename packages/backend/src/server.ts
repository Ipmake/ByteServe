import path from 'path';
import fs from 'fs/promises';
import { app } from './';
import express from 'express';
import { Init } from './utils/initServer';

export async function startServer(port: number | string) {
    await Init();
        
    const __dirname = process.cwd();
    const routesDir = path.join(__dirname, 'dist', 'routes');
    const wwwDir = path.join(__dirname, 'www');
    
    try {
        // Ensure routes directory exists
        await fs.mkdir(routesDir, { recursive: true }).catch(() => {});
        
        // Enable CORS for all requests
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            next();
        });

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
                res.status(404).json({ error: 'Route not found' });
            });
        }
        
        return app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        throw err;
    }
}