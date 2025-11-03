import express, { Request, Response } from 'express';
import { AuthUser, HashPW } from '../utils/authLoader';
import { prisma } from '../fork';
import Joi from 'joi';

const router = express.Router();

// Add JSON parsing middleware for user routes
router.use(express.json({ limit: '50mb' }));

// Middleware to check if user is admin
export async function requireAdmin(req: Request, res: Response, next: express.NextFunction) {
    const token = req.headers.authorization;
    const user = await AuthUser(token);
    
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    
    if (!user.user.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }

    req.user = user;
    
    next();
}

// Get all users (admin only)
router.get('/', requireAdmin, async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                enabled: true,
                isAdmin: true,
                storageQuota: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        
        // Convert BigInt to Number for JSON serialization
        const usersWithQuota = users.map(user => ({
            ...user,
            storageQuota: Number(user.storageQuota),
        }));
        
        res.json(usersWithQuota);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get single user (admin only)
router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                enabled: true,
                isAdmin: true,
                storageQuota: true,
                createdAt: true,
            },
        });
        
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        
        res.json({
            ...user,
            storageQuota: Number(user.storageQuota),
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

const CreateUserSchema = Joi.object({
    username: Joi.string().min(3).max(32).required().messages({
        'string.empty': 'Username is required',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must not exceed 32 characters',
        'any.required': 'Username is required'
    }),
    password: Joi.string().min(6).required().messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 6 characters long',
        'any.required': 'Password is required'
    }),
    enabled: Joi.boolean().default(true),
    isAdmin: Joi.boolean().default(false),
    storageQuota: Joi.number().integer().min(-1).default(-1), // -1 for unlimited
});

// Create user (admin only)
router.post('/', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { error, value } = CreateUserSchema.validate(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        
        const { username, password, enabled, isAdmin, storageQuota } = value;
        
        // Check if username already exists
        const existingUser = await prisma.user.findFirst({
            where: { username },
        });
        
        if (existingUser) {
            res.status(400).json({ error: 'Username already exists' });
            return;
        }
        
        const hashedPassword = HashPW(password);
        
        const user = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                enabled,
                isAdmin,
                storageQuota: BigInt(storageQuota),
            },
            select: {
                id: true,
                username: true,
                enabled: true,
                isAdmin: true,
                storageQuota: true,
                createdAt: true,
            },
        });
        
        res.status(201).json({
            ...user,
            storageQuota: Number(user.storageQuota),
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

const UpdateUserSchema = Joi.object({
    username: Joi.string().min(3).max(32).optional(),
    password: Joi.string().min(6).optional(),
    enabled: Joi.boolean().optional(),
    isAdmin: Joi.boolean().optional(),
    storageQuota: Joi.number().integer().min(-1).optional(), // -1 for unlimited
});

// Update user (admin only)
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { error, value } = UpdateUserSchema.validate(req.body);
        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        
        const { username, password, enabled, isAdmin, storageQuota } = value;
        
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id: req.params.id },
        });
        
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        
        // Check if username is being changed and if it's already taken
        if (username && username !== existingUser.username) {
            const userWithUsername = await prisma.user.findFirst({
                where: { username },
            });
            
            if (userWithUsername) {
                res.status(400).json({ error: 'Username already exists' });
                return;
            }
        }
        
        const updateData: any = {};
        if (username) updateData.username = username;
        if (password) updateData.password = HashPW(password);
        if (enabled !== undefined) updateData.enabled = enabled;
        if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
        if (storageQuota !== undefined) updateData.storageQuota = BigInt(storageQuota);
        
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
            select: {
                id: true,
                username: true,
                enabled: true,
                isAdmin: true,
                storageQuota: true,
                createdAt: true,
            },
        });
        
        res.json({
            ...user,
            storageQuota: Number(user.storageQuota),
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization;
        const authUser = await AuthUser(token);
        
        // Prevent self-deletion
        if (authUser && authUser.user.id === req.params.id) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
        }
        
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id: req.params.id },
        });
        
        if (!existingUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        
        // Delete user (cascade will handle auth tokens)
        await prisma.user.delete({
            where: { id: req.params.id },
        });
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

export default router;
