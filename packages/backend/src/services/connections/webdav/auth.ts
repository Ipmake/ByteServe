import express from 'express';
import crypto from 'crypto';
import { prisma } from '../../../fork';
import { WebDAVUser } from './types';
import { ConfigManager } from '../../configService';

// Parse HTTP Digest Authorization header
function parseDigestAuth(authHeader: string): any {
    const parts: any = {};
    const regex = /(\w+)=["']?([^"',]+)["']?/g;
    let match;
    
    while ((match = regex.exec(authHeader)) !== null) {
        parts[match[1]] = match[2];
    }
    
    return parts;
}

// Generate MD5 hash
function md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
}

// Verify Digest authentication
export async function verifyDigestAuth(req: express.Request): Promise<WebDAVUser | null> {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Digest ')) {
        return null;
    }
    
    const authParams = parseDigestAuth(authHeader.substring(7));
    const username = authParams.username;
    
    if (!username) {
        return null;
    }
    
    // Look up credential in database
    const credential = await prisma.webDAVCredential.findUnique({
        where: { username },
        include: {
            bucketAccess: true,
        },
    });
    
    if (!credential) {
        console.log('[WebDAV Auth] User not found:', username);
        return null;
    }
    
    // Calculate expected response for Digest auth
    const ha1 = md5(`${username}:${ConfigManager.Config["site_name"]} WebDAV:${credential.password}`);
    const ha2 = md5(`${req.method}:${authParams.uri}`);
    
    let expectedResponse;
    if (authParams.qop === 'auth') {
        expectedResponse = md5(`${ha1}:${authParams.nonce}:${authParams.nc}:${authParams.cnonce}:${authParams.qop}:${ha2}`);
    } else {
        expectedResponse = md5(`${ha1}:${authParams.nonce}:${ha2}`);
    }
    
    if (authParams.response !== expectedResponse) {
        console.log('[WebDAV Auth] Digest mismatch');
        return null;
    }
    
    return {
        username: credential.username,
        bucketIds: credential.bucketAccess.map(ba => ba.bucketId),
        userId: credential.userId,
    };
}

// Send Digest authentication challenge
export function sendAuthChallenge(res: express.Response) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const opaque = crypto.randomBytes(16).toString('hex');
    
    res.setHeader('WWW-Authenticate', 
        `Digest realm="${ConfigManager.Config["site_name"]} WebDAV", qop="auth", nonce="${nonce}", opaque="${opaque}"`
    );
    res.status(401).send('Unauthorized');
}
