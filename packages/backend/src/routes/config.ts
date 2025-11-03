import express from 'express';
import { requireAdmin } from './users';
import { prisma } from '../fork';
import Joi from 'joi';

const router = express.Router();

// Add JSON parsing middleware for config routes
router.use(express.json({ limit: '50mb' }));

router.get('/', requireAdmin, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;

    const config = await prisma.config.findMany({
        orderBy: {
            key: 'asc'
        }
    })

    res.json(config satisfies Config.ConfigItem[]);
});

const UpdateSingleConfigSchema = Joi.object({
    value: Joi.string().required()
});

router.put('/:key', requireAdmin, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { user, token } = req.user;
    const { key } = req.params;

    const { value: body, error } = UpdateSingleConfigSchema.validate(req.body);
    const { value } = body;

    if (error) {
        return res.status(400).json({ error: 'Invalid request data', details: error.details });
    }

    const configItem = await prisma.config.findUnique({
        where: {
            key: key
        }
    });

    if (!configItem) {
        return res.status(404).json({ error: 'Config item not found' });
    }

    const updatedConfig = await prisma.config.update({
        where: {
            key: key
        },
        data: {
            value: value
        }
    });

    res.json(updatedConfig satisfies Config.ConfigItem);
});

const UpdateMultipleConfigSchema = Joi.object({
    configs: Joi.array().items(
        Joi.object({
            key: Joi.string().required().min(3).max(64),
            value: Joi.string().required().max(256)
        })
    ).required()
});

router.put('/', requireAdmin, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { value: body, error } = UpdateMultipleConfigSchema.validate(req.body);
    const { configs } = body;

    if (error) return res.status(400).json({ error: 'Invalid request data', details: error.details });

    const updatePromises = configs.map((config: {
        key: string;
        value: string;
    }) => {
        return prisma.config.update({
            where: {
                key: config.key
            },
            data: {
                value: config.value
            }
        });
    });

    const updatedConfigs = await prisma.$transaction(updatePromises);

    res.json(updatedConfigs satisfies Config.ConfigItem[]);
});

export default router;