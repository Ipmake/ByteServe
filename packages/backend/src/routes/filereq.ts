import express from 'express';
import Joi from 'joi';
import { AuthLoader } from '../utils/authLoader';
import { randomUUID } from 'crypto';
import { prisma, redis } from '..';
import bodyParser from 'body-parser';
import fs from 'fs';
import { getObjectPath, getStorageDir } from '../common/object-nesting';
import path from 'path';
import mime from 'mime';
import { CheckUserQuota } from '../common/file-upload';

const router = express.Router();

const CreateFileRequestSchema = Joi.object({
    bucket: Joi.string().required(),
    parent: Joi.string().allow(null).required(),
    filename: Joi.string().optional(),
    requireApiKey: Joi.boolean().optional().default(false),
});

router.post('/', AuthLoader, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { user, token } = req.user;

    const { error, value } = CreateFileRequestSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const reqId = randomUUID();

    const reqData: FileReq.FileRequest = {
        id: reqId,
        bucket: value.bucket,
        parent: value.parent,
        filename: value.filename || null,
        userId: user.id,
        requireApiKey: value.requireApiKey,
        createdAt: Date.now(),
    }

    await Promise.all([
        redis.json.set(`filereq:${reqId}`, '$', reqData as any),
        redis.expire(`filereq:${reqId}`, 1800) // 1 hour expiration
    ]);

    res.status(201).json(reqData);
});

router.get('/:id/sh', async (req, res) => {
    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).send(`
        #!/bin/bash
        echo "Error: File request not found or has expired."
        exit 1
    `);

    res.setHeader('Content-Type', 'application/x-sh');
    res.send([
        '#!/bin/bash',
        '# File Upload Script (Chunked)',
        `# Usage: curl ${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/filereq/${reqId}/sh | bash -s -- --file myfile.txt`,
        '',
        '# Parse arguments',
        'FILE=""',
        'SAVE_AS=""',
        'QUIET=0',
        reqData.requireApiKey ? 'API_KEY=""' : '',
        'CHUNK_SIZE=$((5 * 1024 * 1024))  # 5MB chunks',
        '',
        'while [[ "$#" -gt 0 ]]; do',
        '  case $1 in',
        '    --file) FILE="$2"; shift ;;',
        '    --save-as) SAVE_AS="$2"; shift ;;',
        '    --quiet) QUIET=1 ;;',
        reqData.requireApiKey ? '    --api-key) API_KEY="$2"; shift ;;' : '',
        '    *) echo "Unknown parameter: $1"; exit 1 ;;',
        '  esac',
        '  shift',
        'done',
        '',
        '# Validate required arguments',
        'if [[ -z "$FILE" ]]; then',
        '  echo "Error: --file argument is required"',
        '  exit 1',
        'fi',
        '',
        reqData.requireApiKey ? 'if [[ -z "$API_KEY" ]]; then' : '',
        reqData.requireApiKey ? '  echo "Error: --api-key argument is required"' : '',
        reqData.requireApiKey ? '  exit 1' : '',
        reqData.requireApiKey ? 'fi' : '',
        reqData.requireApiKey ? '' : '',
        'if [[ ! -f "$FILE" ]]; then',
        '  echo "Error: File not found: $FILE"',
        '  exit 1',
        'fi',
        '',
        '# Setup',
        'FILENAME="${SAVE_AS:-$(basename "$FILE")}"',
        `BASE_URL="${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/filereq/${reqId}"`,
        'FILE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)',
        'TOTAL_CHUNKS=$(( (FILE_SIZE + CHUNK_SIZE - 1) / CHUNK_SIZE ))',
        reqData.requireApiKey ? 'AUTH_HEADER=(-H "Authorization: Bearer $API_KEY")' : 'AUTH_HEADER=()',
        '',
        '[[ $QUIET -eq 0 ]] && echo "Uploading $FILE ($FILE_SIZE bytes) as $FILENAME in $TOTAL_CHUNKS chunk(s)..."',
        '',
        '# Step 1: Initiate upload',
        '[[ $QUIET -eq 0 ]] && echo "Initiating upload..."',
        'HTTP_CODE=$(curl -X POST -o /dev/null -w "%{http_code}" -s "${AUTH_HEADER[@]}" -H "X-Filename: $FILENAME" "$BASE_URL/upload")',
        '',
        'if [[ "$HTTP_CODE" != "200" ]]; then',
        '  echo "Error: Failed to initiate upload (HTTP $HTTP_CODE)"',
        '  exit 1',
        'fi',
        '',
        '# Step 2: Upload chunks',
        'OFFSET=0',
        'CHUNK_NUM=1',
        '',
        'while [[ $OFFSET -lt $FILE_SIZE ]]; do',
        '  [[ $QUIET -eq 0 ]] && echo "Uploading chunk $CHUNK_NUM/$TOTAL_CHUNKS..."',
        '  ',
        '  dd if="$FILE" bs=$CHUNK_SIZE skip=$((CHUNK_NUM - 1)) count=1 2>/dev/null | \\',
        '    curl -X PUT -T - -s "${AUTH_HEADER[@]}" "$BASE_URL/upload" > /dev/null',
        '  ',
        '  if [[ ${PIPESTATUS[1]} -ne 0 ]]; then',
        '    echo "Error: Failed to upload chunk $CHUNK_NUM"',
        '    exit 1',
        '  fi',
        '  ',
        '  OFFSET=$((OFFSET + CHUNK_SIZE))',
        '  CHUNK_NUM=$((CHUNK_NUM + 1))',
        'done',
        '',
        '# Step 3: Complete upload',
        '[[ $QUIET -eq 0 ]] && echo "Finalizing upload..."',
        'RESPONSE=$(curl -X POST -s "${AUTH_HEADER[@]}" "$BASE_URL/upload/complete")',
        '',
        'if [[ $? -eq 0 ]]; then',
        '  [[ $QUIET -eq 0 ]] && echo "Upload complete!"',
        '  [[ $QUIET -eq 0 ]] && echo "$RESPONSE"',
        'else',
        '  echo "Error: Failed to complete upload"',
        '  exit 1',
        'fi',
        ''
    ].filter(line => line !== '').join('\n'));
});

router.post('/:id/upload', async (req, res) => {
    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).json({ error: 'File request not found' });

    if (reqData.requireApiKey) {
        const apiKey = req.headers['authorization']?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        const validKey = await prisma.authTokens.findFirst({
            where: {
                token: apiKey,
                isApi: true,
            }
        });

        if (!validKey) {
            return res.status(403).json({ error: 'Invalid API key' });
        }
    }

    const tempDir = path.join(getStorageDir(), '.temp');

    await fs.promises.writeFile(path.join(tempDir, `multipart_${reqId}`), '', {
        flag: 'w'
    });

    const fileName = reqData.filename || req.headers['x-filename'] as string || `filereq-${reqData.id}`;

    await redis.json.set(`filereq:${reqId}`, '$.filename', fileName);

    res.status(200).json({ message: 'Uploaded started successfully' });
});

router.put('/:id/upload', bodyParser.raw({
    type: (req) => {
        return true;
    },
    limit: '50mb'
}), async (req, res) => {
    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).json({ error: 'File request not found' });

    if (reqData.requireApiKey) {
        const apiKey = req.headers['authorization']?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        const validKey = await prisma.authTokens.findFirst({
            where: {
                token: apiKey,
                isApi: true,
                userId: reqData.userId,
            }
        });

        if (!validKey) {
            return res.status(403).json({ error: 'Invalid API key' });
        }
    }

    const bucket = await prisma.bucket.findUnique({
        where: { id: reqData.bucket },
        include: { owner: true }
    });

    if (!bucket) return res.status(500).json({ error: 'Bucket not found' });


    const tempDir = path.join(getStorageDir(), '.temp');
    const tempFilePath = path.join(tempDir, `multipart_${reqId}`);

    const fileSize = await fs.promises.stat(tempFilePath).then(stat => stat.size).catch(() => 0);

    const quotaValid = await CheckUserQuota(bucket, fileSize + req.body.length);

    if (!quotaValid) {
        await fs.promises.unlink(tempFilePath).catch(() => { });
        return res.status(403).json({ error: "Quota exceeded, upload reset" });
    }

    await fs.promises.appendFile(tempFilePath, req.body);

    res.status(200).json({ message: 'Chunk uploaded successfully' });
});

router.post('/:id/upload/complete', async (req, res) => {
    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).json({ error: 'File request not found' });

    if (reqData.requireApiKey) {
        const apiKey = req.headers['authorization']?.split(' ')[1];
        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        const validKey = await prisma.authTokens.findFirst({
            where: {
                token: apiKey,
                isApi: true,
                userId: reqData.userId,
            }
        });

        if (!validKey) {
            return res.status(403).json({ error: 'Invalid API key' });
        }
    }

    const tempDir = path.join(getStorageDir(), '.temp');
    const tempFilePath = path.join(tempDir, `multipart_${reqId}`);

    const bucket = await prisma.bucket.findUnique({
        where: { id: reqData.bucket },
        include: { owner: true }
    });
    if (!bucket) return res.status(500).json({ error: 'Bucket not found' });

    const fileSize = await fs.promises.stat(tempFilePath).then(stat => stat.size).catch(() => 0);

    const quotaValid = await CheckUserQuota(bucket, fileSize);

    if (!quotaValid) {
        await fs.promises.unlink(tempFilePath).catch(() => { });
        return res.status(403).json({ error: "Quota exceeded, upload canceled" });
    }

    const newObject = await prisma.object.create({
        data: {
            bucketId: reqData.bucket,
            parentId: reqData.parent,
            filename: reqData.filename || `filereq-${reqData.id}`,
            mimeType: mime.lookup(reqData.filename || 'untitled') || 'application/octet-stream',
            size: BigInt((await fs.promises.stat(tempFilePath)).size),
        }
    });


    const destPath = getObjectPath(bucket.name, newObject.id);
    await fs.promises.rename(tempFilePath, destPath);

    await redis.json.del(`filereq:${reqId}`);

    res.status(200).json({ message: 'Upload completed successfully' });
});

router.delete('/:id', AuthLoader, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { user, token } = req.user;

    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).json({ error: 'File request not found' });

    if (reqData.userId !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    await redis.json.del(`filereq:${reqId}`);

    res.status(200).json({ message: 'File request deleted successfully' });
});

export default router;