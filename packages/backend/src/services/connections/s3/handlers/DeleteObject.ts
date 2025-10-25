import express from 'express';
import { DelegateExpressRequestToWorker } from '../../../../common/object';

export default function S3Handlers_DeleteObject(router: express.Router) {
    router.delete('/:bucket/*', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_DeleteObject', req, res);
    });
}