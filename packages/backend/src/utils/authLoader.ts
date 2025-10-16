import { prisma } from "..";
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { User, AuthTokens } from '@prisma/client';

// Extend Express Request type to include authenticated user data
export interface AuthenticatedRequest extends Request {
    user: User;
    token: AuthTokens;
}

export async function AuthUser(token?: string) {
    if (!token || token === undefined) return null;

    token = token.split(' ')[token.split(' ').length - 1];

    if(!token) return null;

    const tokenData = await prisma.authTokens.findUnique({
        where: {
            token: token
        },
        include: {
            user: true
        }
    });

    if (!tokenData || !tokenData.user.enabled) return null;

    return {
        user: tokenData.user,
        token: tokenData
    };
}

export async function AuthLoader(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const token = req.headers.authorization;
    
    const authData = await AuthUser(token);
    
    if (!authData) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    
    // Attach user and token data to request
    (req as AuthenticatedRequest).user = authData.user;
    (req as AuthenticatedRequest).token = authData.token;
    
    next();
}

export function HashPW(password: string) {
    return crypto.createHash('sha256')
        .update(`filegrave${password}filegrave`)
        .digest('hex');
}