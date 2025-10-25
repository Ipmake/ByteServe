import express from 'express';

export function ExpressRequestToWorkerRequest(req: express.Request): Worker.WorkerRequest {
    return {
        headers: req.headers as Record<string, string>,
        method: req.method,
        params: req.params,
        query: req.query as Record<string, string>,
        body: req.body,
    };
}