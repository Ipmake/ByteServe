import express from 'express';
import { workerPool } from '..';
import { MessagePort } from 'worker_threads';

export function ExpressRequestToWorkerRequest(req: express.Request): Worker.WorkerRequest {
    return {
        headers: req.headers as Record<string, string>,
        method: req.method,
        params: req.params,
        query: req.query as Record<string, string>,
        body: req.body,

        path: req.path,
        originalUrl: req.originalUrl,
        protocol: req.protocol,

        host: req.get('host') || '',
    };
}

export async function DelegateExpressRequestToWorker(workerFunctionName: string, req: express.Request, res: express.Response, isBuffer: boolean = false): Promise<void> {
    const workerResponse: Worker.WorkerResponse = await workerPool.run(ExpressRequestToWorkerRequest(req), {
        name: workerFunctionName,
    });

    if (workerResponse.headers) {
        for (const [key, value] of Object.entries(workerResponse.headers)) {
            res.setHeader(key, value);
        }
    }
    res.status(workerResponse.status).send(isBuffer ? Buffer.from(workerResponse.body) : workerResponse.body);
    return;
}