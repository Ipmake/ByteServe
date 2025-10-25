import express from 'express';
import { AuthLoader } from '../utils/authLoader';
import bodyParser from 'body-parser';
import { DelegateExpressRequestToWorker } from '../common/object';

const router = express.Router();

router.post('/', AuthLoader, async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_CreateFileRequest', req, res);
});

router.get('/:id/sh', async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_GetSH', req, res);
});

router.get('/:id/ps1', async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_GetPowerShell', req, res);
});

router.post('/:id/upload', async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_PostUpload', req, res);
});

router.put('/:id/upload', bodyParser.raw({
    type: (req) => { return true; },
    limit: '50mb'
}), async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_PutUploadChunk', req, res);
});

router.post('/:id/upload/complete', async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_PostCompleteUpload', req, res);
});

router.delete('/:id', AuthLoader, async (req, res) => {
    return await DelegateExpressRequestToWorker('FileRequestWorker_DeleteFileRequest', req, res);
});

export default router;