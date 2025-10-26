import express, { Request, Response } from 'express';
import { AuthUser, HashPW } from '../utils/authLoader';
import { prisma } from '..';
import Joi from 'joi';

const router = express.Router();

router.get('/me', async (req, res) => {
    const token = req.headers.authorization;

    const user = await AuthUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.token.isApi) return res.status(403).json({ error: 'API tokens may not access this endpoint' });

    res.json({
        id: user.user.id,
        username: user.user.username,
        token: user.token.token,
        isApi: user.token.isApi,
        isAdmin: user.user.isAdmin,
        storageQuota: Number(user.user.storageQuota)
    } satisfies Auth.Session);
});

const LoginSchema = Joi.object({
    username: Joi.string().min(3).max(32).required().messages({
        'string.empty': 'Username is required',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must not exceed 32 characters',
        'any.required': 'Username is required'
    }),
    password: Joi.string().required().messages({
        'string.empty': 'Password is required',
        'any.required': 'Password is required'
    }),
    deviceIdentifier: Joi.string().max(128).optional().messages({
        'string.max': 'Device identifier must not exceed 128 characters'
    })
});

router.post('/login', async (req: Request, res: Response) => {
    // Validate request body
    const { error, value } = LoginSchema.validate(req.body);
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    const { username, password: PasswordHash1 } = value;

    await new Promise(r => setTimeout(r, 2500)); // Delay to mitigate brute-force attacks

    const password = HashPW(PasswordHash1);

    const user = await prisma.user.findFirst({
        where: {
            username: username,
            password: password
        }
    });
    if (!user || user.password !== password) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
    }

    if (!user.enabled) {
        res.status(403).json({ error: 'User is disabled' });
        return;
    }

    const newToken = require('crypto').randomBytes(128).toString('hex');

    await prisma.authTokens.create({
        data: {
            token: newToken,
            description: value.deviceIdentifier || "Unknown Device",
            userId: user.id,
            isApi: false,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
    });

    res.json({
        id: user.id,
        username: user.username,
        token: newToken,
        isApi: false,
        isAdmin: user.isAdmin,
        storageQuota: Number(user.storageQuota)
    } satisfies Auth.Session);
});

const ChangePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'string.empty': 'Current password is required',
        'any.required': 'Current password is required'
    }),
    newPassword: Joi.string().required().messages({
        'string.empty': 'New password is required',
        'any.required': 'New password is required'
    })
});

router.post('/change-password', async (req: Request, res: Response) => {
    const token = req.headers.authorization;

    const user = await AuthUser(token);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    // Validate request body
    const { error, value } = ChangePasswordSchema.validate(req.body);
    if (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    const { currentPassword: currentPasswordHash1, newPassword: newPasswordHash1 } = value;

    const currentPassword = HashPW(currentPasswordHash1);
    const newPassword = HashPW(newPasswordHash1);

    try {
        // Verify current password
        const dbUser = await prisma.user.findUnique({
            where: { id: user.user.id }
        });

        if (!dbUser || dbUser.password !== currentPassword) {
            res.status(400).json({ error: 'Current password is incorrect' });
            return;
        }

        // Update password
        await prisma.user.update({
            where: { id: user.user.id },
            data: { password: newPassword }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

router.post('/logout', async (req: Request, res: Response) => {
    const token = req.headers.authorization;

    const user = await AuthUser(token);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    await prisma.authTokens.deleteMany({
        where: {
            token: token
        }
    });

    res.json({ message: 'Logged out successfully' });
});

router.get('/tokens', async (req: Request, res: Response) => {
    const token = req.headers.authorization;

    const user = await AuthUser(token);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const tokens = await prisma.authTokens.findMany({
        where: {
            userId: user.user.id,
            isApi: false
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    res.json(tokens.map(t => ({
        id: t.id,
        description: t.description,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt
    })));
})

router.delete('/tokens/:id', async (req: Request, res: Response) => {
    const token = req.headers.authorization;

    const user = await AuthUser(token);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const authToken = await prisma.authTokens.findUnique({
        where: {
            id: req.params.id
        }
    });

    if (!authToken || authToken.userId !== user.user.id || authToken.isApi) {
        res.status(404).json({ error: 'Token not found' });
        return;
    }

    await prisma.authTokens.delete({
        where: {
            id: req.params.id
        }
    });

    res.json({ message: 'Token deleted successfully' });
});

export default router;