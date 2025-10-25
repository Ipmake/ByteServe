import express from 'express';
import { DelegateExpressRequestToWorker } from '../../../../common/object';

export default function S3Handlers_ListObjectsV2(router: express.Router) {
    router.get('/:bucket', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_ListObjectsV2', req, res);
    });
}