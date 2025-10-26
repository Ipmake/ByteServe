import express from 'express';
import { DelegateExpressRequestToWorker, ExpressRequestToWorkerRequest } from '../../../../common/object';
import { MessagePortDuplex } from '../../../../common/stream';
import { workerPool } from '../../../..';

export default function S3Handlers_GetObject(router: express.Router) {
    router.get('/:bucket/*', async (req, res) => {
        const { port1, port2 } = new MessageChannel();

        port1.once('message', async (metadata) => {
            try {
                // Set headers based on metadata
                res.status(200);
                res.setHeader('Content-Type', metadata.mimeType);
                res.setHeader('Content-Disposition', `inline; filename="${metadata.filename}"`);
                res.setHeader('Content-Length', metadata.contentLength);

                const duplex = new MessagePortDuplex(port1);

                // Pipe the rest of the data
                duplex.pipe(res);
            } catch (e) {
                res.status(500).send('Invalid metadata');
            }
        });

        const data = { port: port2, req: ExpressRequestToWorkerRequest(req) };

        const workerRes = await workerPool.run(data, {
            name: 'S3WorkerHandlers_GetObject',
            transferList: [port2],
        });

        if (workerRes.status !== 200 || workerRes.body) {
            port1.close();
            port2.close();
            return res.status(workerRes.status).json(workerRes.body);
        }
    });
}