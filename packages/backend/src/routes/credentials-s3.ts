import express, { Request, Response } from 'express';
import { AuthUser } from '../utils/authLoader';
import { prisma } from '../fork';
import Joi from 'joi';
import { generateRandomString } from '../common/string';

const router = express.Router();

// Add JSON parsing middleware for S3 credential routes
router.use(express.json({ limit: '50mb' }));

// Get all S3 credentials for the current user
router.get('/', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);

        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const credentials = await prisma.s3Credential.findMany({
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

        res.json(credentials.map(cred => ({
            ...cred,
            createdAt: cred.createdAt.toISOString(),
            updatedAt: cred.updatedAt.toISOString(),
            bucketAccess: cred.bucketAccess.map(access => ({
                id: access.bucketId,
                name: access.bucket.name,
            })),
        } satisfies Credentials.S3.Credential)));
    } catch (error) {
        console.error('Error fetching S3 credentials:', error);
        res.status(500).json({ error: 'Failed to fetch S3 credentials' });
    }
});

const CreateCredentialSchema = Joi.object({
    bucketIds: Joi.array().items(Joi.string().uuid()).required().messages({
        'array.base': 'Bucket IDs must be an array',
        'any.required': 'Bucket IDs are required'
    }),
});

// Create new S3 credential
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

        // Generate unique access key
        let accessKey: string;
        let attempts = 0;
        do {
            const randomSuffix = generateRandomString(4);
            accessKey = `AKIA${user.user.id.split("-")[0]}${user.user.id.split("-")[1]}${randomSuffix}`.toUpperCase();
            const existing = await prisma.s3Credential.findUnique({
                where: { accessKey },
            });
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
            res.status(500).json({ error: 'Failed to generate unique access key' });
            return;
        }

        // Generate access secret
        const accessSecret = generateRandomString(40);

        // Create credential with bucket access
        const credential = await prisma.s3Credential.create({
            data: {
                userId: user.user.id,
                accessKey,
                secretKey: accessSecret,
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

        res.status(201).json({
            ...credential,
            createdAt: credential.createdAt.toISOString(),
            updatedAt: credential.updatedAt.toISOString(),
            bucketAccess: credential.bucketAccess.map(access => ({
                id: access.bucketId,
                name: access.bucket.name,
            })),
        } satisfies Credentials.S3.Credential);
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

// Update S3 credential (update bucket access)
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
        const credential = await prisma.s3Credential.findFirst({
            where: {
                id: req.params.id,
                userId: user.user.id,
            },
        });

        if (!credential) {
            res.status(404).json({ error: 'S3 credential not found' });
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
        await prisma.s3BucketAccess.deleteMany({
            where: {
                credentialId: req.params.id,
            },
        });

        // Create new bucket access
        const updated = await prisma.s3Credential.update({
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

        res.json({
            ...updated,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
            bucketAccess: updated.bucketAccess.map(access => ({
                id: access.bucketId,
                name: access.bucket.name,
            })),
        } satisfies Credentials.S3.Credential);
    } catch (error) {
        console.error('Error updating S3 credential:', error);
        res.status(500).json({ error: 'Failed to update S3 credential' });
    }
});

// Delete S3 credential
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const user = await AuthUser(token);

        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Check if credential exists and belongs to user
        const credential = await prisma.s3Credential.findFirst({
            where: {
                id: req.params.id,
                userId: user.user.id,
            },
        });

        if (!credential) {
            res.status(404).json({ error: 'S3 credential not found' });
            return;
        }

        await prisma.s3Credential.delete({
            where: { id: req.params.id },
        });

        res.json({ message: 'S3 credential deleted successfully' } satisfies API.BasicResponse);
    } catch (error) {
        console.error('Error deleting S3 credential:', error);
        res.status(500).json({ error: 'Failed to delete S3 credential' });
    }
});

export default router;
