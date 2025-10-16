import express from 'express';

export async function handleOptions(req: express.Request, res: express.Response) {
    res.setHeader('DAV', '1, 2');
    res.setHeader('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY');
    res.setHeader('MS-Author-Via', 'DAV');
    res.status(200).end();
}
