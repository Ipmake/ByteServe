import express from 'express';
import { DelegateExpressRequestToWorker } from '../../../../common/object';

export default function S3Handlers_PostObject(router: express.Router) {
    router.post('/:bucket/*', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_PostMultiPartUpload', req, res);
    });

    router.put('/:bucket/*', async (req, res) => {
        return await DelegateExpressRequestToWorker('S3WorkerHandlers_PutMultiPartUpload', req, res);
    })
}