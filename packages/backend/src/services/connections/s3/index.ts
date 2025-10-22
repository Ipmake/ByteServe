import express from 'express';
import S3Handlers_GetObject from './handlers/GetObject';
import S3Handlers_ListBuckets from './handlers/ListBuckets';
import S3Handlers_ListObjectsV2 from './handlers/ListObjectsV2';
import S3Handlers_PostObject from './handlers/MultiPartUpload';
import S3Handlers_DeleteObject from './handlers/DeleteObject';

export function setupS3Server(app: express.Application) {
    console.log("Setting up S3 server routes...");

    const router = express.Router({

    });

    // Log all requests
    router.use((req, res, next) => {
        console.log(`[S3] ${req.method} ${req.url}`);
        next();
    });

    // Register handlers
    S3Handlers_ListBuckets(router);
    S3Handlers_ListObjectsV2(router);
    S3Handlers_GetObject(router);
    S3Handlers_PostObject(router);
    S3Handlers_DeleteObject(router);

    app.use('/s3', router);

    console.log("S3 server mounted at /s3");
}