import express from 'express';
import { ConfigManager } from '../services/configService';

const router = express.Router();

router.use(express.json({ limit: '50mb' }));

router.get('/', async (req, res) => {
    res.json({
        app: ConfigManager.Config["site_name"] || "FileGrave",
        version: process.env.npm_package_version || "unknown",
        status: "running"
    })
})

export default router;