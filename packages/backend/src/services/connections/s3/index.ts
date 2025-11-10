import express from 'express';
import S3Handlers_GetObject from './handlers/GetObject';
import S3Handlers_ListBuckets from './handlers/ListBuckets';
import S3Handlers_ListObjectsV2 from './handlers/ListObjectsV2';
import S3Handlers_PostObject from './handlers/MultiPartUpload';
import S3Handlers_DeleteObject from './handlers/DeleteObject';
import S3Handlers_HeadObject from './handlers/HeadObject';
import S3Handlers_DeleteObjects from './handlers/DeleteObjects';
import S3Handlers_AbortMultipartUpload from './handlers/AbortMultipartUpload';
import S3Handlers_ListParts from './handlers/ListParts';
import S3Handlers_ListMultipartUploads from './handlers/ListMultipartUploads';

export function setupS3Server(app: express.Application) {
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
    S3Handlers_ListMultipartUploads(router);
    S3Handlers_HeadObject(router);
    S3Handlers_GetObject(router);
    S3Handlers_PostObject(router);
    S3Handlers_DeleteObjects(router);
    S3Handlers_DeleteObject(router);
    S3Handlers_AbortMultipartUpload(router);
    S3Handlers_ListParts(router);

    app.use('/s3', router);
}