import express from 'express';
import { DelegateExpressRequestToWorker } from '../../../../common/object';

export default function S3Handlers_ListBuckets(router: express.Router) {
    router.get('/', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_ListBuckets', req, res);
    });
}