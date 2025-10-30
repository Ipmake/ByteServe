import express, { Request, Response } from 'express';
import { AuthUser } from '../utils/authLoader';
import { prisma } from '../fork';
import Joi from 'joi';
import { generateRandomString } from '../common/string';

const router = express.Router();

// Get all WebDAV credentials for the current user
router.get('/', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);
        
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const credentials = await prisma.webDAVCredential.findMany({
            where: {
                userId: user.user.id,
            },
            include: {
                bucketAccess: {
                    include: {
                        bucket: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        res.json(credentials);
    } catch (error) {
        console.error('Error fetching WebDAV credentials:', error);
        res.status(500).json({ error: 'Failed to fetch WebDAV credentials' });
    }
});

const CreateCredentialSchema = Joi.object({
    bucketIds: Joi.array().items(Joi.string().uuid()).required().messages({
        'array.base': 'Bucket IDs must be an array',
        'any.required': 'Bucket IDs are required'
    }),
});

// Create new WebDAV credential
router.post('/', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);
        
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { error, value } = CreateCredentialSchema.validate(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }

        const { bucketIds } = value;

        // Verify all buckets belong to the user
        const buckets = await prisma.bucket.findMany({
            where: {
                id: { in: bucketIds },
                ownerId: user.user.id,
            },
        });

        if (buckets.length !== bucketIds.length) {
            res.status(403).json({ error: 'One or more buckets not found or not owned by you' });
            return;
        }

        // Generate unique username
        let username: string;
        let attempts = 0;
        do {
            const randomSuffix = generateRandomString(4);
            username = `${user.user.username}-dav-${randomSuffix}`;
            const existing = await prisma.webDAVCredential.findUnique({
                where: { username },
            });
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
            res.status(500).json({ error: 'Failed to generate unique username' });
            return;
        }

        // Generate password
        const password = generateRandomString(16);

        // Create credential with bucket access
        const credential = await prisma.webDAVCredential.create({
            data: {
                userId: user.user.id,
                username,
                password,
                bucketAccess: {
                    create: bucketIds.map((bucketId: string) => ({
                        bucketId,
                    })),
                },
            },
            include: {
                bucketAccess: {
                    include: {
                        bucket: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        res.status(201).json(credential);
    } catch (error) {
        console.error('Error creating WebDAV credential:', error);
        res.status(500).json({ error: 'Failed to create WebDAV credential' });
    }
});

const UpdateCredentialSchema = Joi.object({
    bucketIds: Joi.array().items(Joi.string().uuid()).required().messages({
        'array.base': 'Bucket IDs must be an array',
        'any.required': 'Bucket IDs are required'
    }),
});

// Update WebDAV credential (update bucket access)
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);
        
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { error, value } = UpdateCredentialSchema.validate(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }

        const { bucketIds } = value;

        // Check if credential exists and belongs to user
        const credential = await prisma.webDAVCredential.findFirst({
            where: {
                id: req.params.id,
                userId: user.user.id,
            },
        });

        if (!credential) {
            res.status(404).json({ error: 'WebDAV credential not found' });
            return;
        }

        // Verify all buckets belong to the user
        const buckets = await prisma.bucket.findMany({
            where: {
                id: { in: bucketIds },
                ownerId: user.user.id,
            },
        });

        if (buckets.length !== bucketIds.length) {
            res.status(403).json({ error: 'One or more buckets not found or not owned by you' });
            return;
        }

        // Delete existing bucket access
        await prisma.webDAVBucketAccess.deleteMany({
            where: {
                credentialId: req.params.id,
            },
        });

        // Create new bucket access
        const updated = await prisma.webDAVCredential.update({
            where: { id: req.params.id },
            data: {
                bucketAccess: {
                    create: bucketIds.map((bucketId: string) => ({
                        bucketId,
                    })),
                },
            },
            include: {
                bucketAccess: {
                    include: {
                        bucket: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating WebDAV credential:', error);
        res.status(500).json({ error: 'Failed to update WebDAV credential' });
    }
});

// Delete WebDAV credential
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);
        
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Check if credential exists and belongs to user
        const credential = await prisma.webDAVCredential.findFirst({
            where: {
                id: req.params.id,
                userId: user.user.id,
            },
        });

        if (!credential) {
            res.status(404).json({ error: 'WebDAV credential not found' });
            return;
        }

        await prisma.webDAVCredential.delete({
            where: { id: req.params.id },
        });

        res.json({ message: 'WebDAV credential deleted successfully' });
    } catch (error) {
        console.error('Error deleting WebDAV credential:', error);
        res.status(500).json({ error: 'Failed to delete WebDAV credential' });
    }
});

export default router;
