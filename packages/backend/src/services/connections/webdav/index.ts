import express from 'express';
import { verifyDigestAuth, sendAuthChallenge } from './auth';
import { handleOptions } from './handlers/options';
import { handlePropfind } from './handlers/propfind';
import { handleGet, handleHead } from './handlers/get';
import { handlePut } from './handlers/put';
import { handleDelete } from './handlers/delete';
import { handleMkcol } from './handlers/mkcol';
import { handleMove } from './handlers/move';
import { handleCopy } from './handlers/copy';
import { handlePatch } from './handlers/put';

export function setupWebDAVServer(app: express.Application) {
    // Only mount the WebDAV router, no extra body hack needed if mounted first
    const webdavRouter = express.Router();
    
    // Authentication middleware
    webdavRouter.use(async (req, res, next) => {
        // OPTIONS requests don't require authentication
        if (req.method === 'OPTIONS') {
            return next();
        }
        
        const user = await verifyDigestAuth(req);
        
        if (!user) {
            return sendAuthChallenge(res);
        }
        
        // Store user in request for handlers to use
        (req as any).webdavUser = user;
        next();
    });
    
    // WebDAV method handlers (use /* to match all paths)
    webdavRouter.options('/*', handleOptions);
    webdavRouter.propfind('/*', handlePropfind);
    webdavRouter.get('/*', handleGet);
    webdavRouter.head('/*', handleHead);
    webdavRouter.put('/*', handlePut);
    webdavRouter.delete('/*', handleDelete);
    webdavRouter.mkcol('/*', handleMkcol);
    webdavRouter.move('/*', handleMove);
    webdavRouter.copy('/*', handleCopy);
    webdavRouter.patch('/*', handlePatch);
    
    // Mount the WebDAV router
    app.use('/dav', webdavRouter);

}
