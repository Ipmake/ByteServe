import path from 'path';
import fs from 'fs/promises';
import { Express } from 'express';

export async function registerRoutes(app: Express, directory: string, baseRoute: string = '') {
    try {
        const files = await fs.readdir(directory, {
            recursive: false,
        });

        for (const file of files) {
            const fullPath = path.join(directory, file);
            const stat = await fs.stat(fullPath);

            if (stat.isDirectory()) {
                await registerRoutes(app, fullPath, `${baseRoute}/${file}`);
            } else {
                // Only process JavaScript files (skip .d.ts declaration files)
                if (!/\.js$/.test(file)) continue;

                // Skip index files
                if (/^index\.js$/.test(file)) continue;

                // Calculate route path
                const routeName = file.replace(/\.js$/, '');
                const routePath = baseRoute + (routeName === 'root' ? '/' : `/${routeName}`);

                try {
                    const routeModule = await import(fullPath);

                    // Handle possibly nested router structure
                    let router;
                    if (routeModule.default && routeModule.default.default && typeof routeModule.default.default.use === 'function') {
                        router = routeModule.default.default;
                    } else if (routeModule.default && typeof routeModule.default.use === 'function') {
                        router = routeModule.default;
                    } else if (routeModule.router && typeof routeModule.router.use === 'function') {
                        router = routeModule.router;
                    } else if (typeof routeModule.use === 'function') {
                        router = routeModule;
                    }

                    // Register the router with the Express app
                    if (router) {
                        app.use(routePath, router);
                    } 

                } catch (err) {
                    console.error(`Failed to load route ${fullPath}:`, err);
                }
            }
        }
    } catch (err) {
        console.error(`Error reading routes directory ${directory}:`, err);
    }
}