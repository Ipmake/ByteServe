import express from 'express';
import { DelegateExpressRequestToWorker } from '../../../../common/object';

export default function S3Handlers_GetObject(router: express.Router) {
   router.get('/:bucket/*', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_GetObject', req, res, true);
    });
}