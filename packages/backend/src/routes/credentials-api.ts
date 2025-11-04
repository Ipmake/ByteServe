import express from 'express';
import { AuthLoader } from '../utils/authLoader';
import { prisma } from '../fork';
import Joi from 'joi';
import crypto from 'crypto';

const router = express.Router();

router.use(express.json({ limit: '50mb' }));

router.get('/', AuthLoader, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const { user, token } = req.user;

        const apiTokens = await prisma.authTokens.findMany({
            where: {
                userId: user.id,
                isApi: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json(apiTokens.map(token => ({
            ...token,
            expiresAt: token.expiresAt.toISOString(),
            createdAt: token.createdAt.toISOString()
        } satisfies Credentials.Api.Credential)));
    } catch (error) {
        console.error('Error fetching credentials:', error);
        res.status(500).json({ error: 'Failed to fetch credentials' });
    }
});

const CreateCredentialSchema = Joi.object({
    expiresInDays: Joi.number().integer().min(1).max(365).required().messages({
        'number.base': 'Expiration days must be a number',
        'number.integer': 'Expiration days must be an integer',
        'number.min': 'Expiration days must be at least 1',
        'number.max': 'Expiration days cannot exceed 365',
        'any.required': 'Expiration days are required'
    }),
    description: Joi.string().max(128).required().messages({
        'string.base': 'Description must be a string',
        'string.max': 'Description must be at most 128 characters long',
        'any.required': 'Description is required'
    })
});

router.post('/', AuthLoader, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const { user, token } = req.user;

        const { error, value } = CreateCredentialSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + value.expiresInDays);

        const newToken = await prisma.authTokens.create({
            data: {
                userId: user.id,
                description: value.description,
                token: crypto.randomBytes(128).toString('hex'),
                expiresAt,
                isApi: true
            }
        });

        res.status(201).json({
            ...newToken,
            expiresAt: newToken.expiresAt.toISOString(),
            createdAt: newToken.createdAt.toISOString()
        } satisfies Credentials.Api.Credential);
    } catch (error) {
        console.error('Error creating API credential:', error);
        res.status(500).json({ error: 'Failed to create API credential' });
    }
});

router.delete('/:id', AuthLoader, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        const { user, token } = req.user;
        const { id } = req.params;

        const credential = await prisma.authTokens.findUnique({
            where: {
                id
            }
        });

        if (!credential || credential.userId !== user.id || !credential.isApi) {
            return res.status(404).json({ error: 'API Credential not found' });
        }

        await prisma.authTokens.delete({
            where: {
                id
            }
        });

        res.json({ message: 'API Credential deleted successfully' } satisfies API.BasicResponse);
    } catch (error) {
        console.error('Error deleting API credential:', error);
        res.status(500).json({ error: 'Failed to delete API credential' });
    }
});

export default router;