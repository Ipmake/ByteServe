import express from 'express';
import Joi from 'joi';
import { AuthLoader } from '../utils/authLoader';
import { randomUUID } from 'crypto';
import { redis } from '..';

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
    if (!reqData) return res.status(404).json({ error: 'Not Found' });

    res.setHeader('Content-Type', 'application/x-sh');
    res.send([
        '#!/bin/bash',
        '# File Upload Script',
        '# Usage: curl https://yoursite.com/api/filereq/' + reqId + '/sh | sh',
        '# Or with args: curl https://yoursite.com/api/filereq/' + reqId + '/sh | sh -s -- --file myfile.txt',
        '',
        '# Arguments:',
        '# --quiet : Suppress output',
        reqData.requireApiKey ? '# --api-key YOUR_API_KEY : Use API key for authentication' : '',
        '# --file FILENAME : Specify filename for the file to upload',
        '# --save-as FILENAME : Specify filename to save as when uploaded',
        '',
        reqData.requireApiKey ? 'FILEGRAVE_API_KEY="${FILEGRAVE_API_KEY:-}"' : '',
        `BUCKET_NAME="${reqData.bucket}"`,
        `PARENT_ID="${reqData.parent || ''}"`,
        `FILENAME="${reqData.filename || ''}"`,
        `SAVE_AS=""`,
        `REQ_ID="${reqData.id}"`,
        `UPLOAD_URL="${process.env.API_URL || req.protocol + '://' + req.get('host')}/api/filereq/${reqId}/upload"`,
        'QUIET=0',
        '',
        'log() {',
        '  if [[ "$QUIET" -eq 0 ]]; then',
        '    echo "$@"',
        '  fi',
        '}',
        '',
        'prompt_for_arg() {',
        '  local var_name="$1"',
        '  local prompt_msg="$2"',
        '  local value="${!var_name}"',
        '  if [[ -z "$value" ]]; then',
        '    read -p "$prompt_msg: " value',
        '    eval "$var_name=\\"$value\\""',
        '  fi',
        '}',
        '',
        'while [[ "$#" -gt 0 ]]; do',
        '  case $1 in',
        '    --quiet) QUIET=1 ;;',
        reqData.requireApiKey ? '    --api-key) FILEGRAVE_API_KEY="$2"; shift ;;' : '',
        '    --file) FILENAME="$2"; shift ;;',
        '    --save-as) SAVE_AS="$2"; shift ;;',
        '    *) echo "Unknown parameter: $1"; exit 1 ;;',
        '  esac',
        '  shift',
        'done',
        '',
        reqData.requireApiKey ? 'prompt_for_arg FILEGRAVE_API_KEY "Enter your API key"' : '',
        'prompt_for_arg FILENAME "Enter the file to upload"',
        '',
        '# Check if file exists',
        'if [[ ! -f "$FILENAME" ]]; then',
        '  echo "Error: File not found: $FILENAME"',
        '  exit 1',
        'fi',
        '',
        '# Prepare filename for upload',
        'UPLOAD_FILENAME="${SAVE_AS:-$(basename "$FILENAME")}"',
        '',
        'log "Uploading $FILENAME as $UPLOAD_FILENAME..."',
        '',
        '# Build curl command',
        'CURL_ARGS=(-X POST)',
        'CURL_ARGS+=(-F "file=@$FILENAME;filename=$UPLOAD_FILENAME")',
        reqData.requireApiKey ? 'CURL_ARGS+=(-H "Authorization: Bearer $FILEGRAVE_API_KEY")' : '',
        '[[ "$QUIET" -eq 1 ]] && CURL_ARGS+=(-s) || CURL_ARGS+=(-#)',
        '',
        '# Perform upload',
        'RESPONSE=$(curl "${CURL_ARGS[@]}" "$UPLOAD_URL")',
        'EXIT_CODE=$?',
        '',
        'if [[ $EXIT_CODE -eq 0 ]]; then',
        '  log "Upload complete!"',
        '  [[ "$QUIET" -eq 0 ]] && echo "$RESPONSE"',
        'else',
        '  echo "Upload failed with exit code $EXIT_CODE"',
        '  exit $EXIT_CODE',
        'fi',
        ''
    ].filter(line => line !== '').join('\n'));
});

router.post('/:id/upload', async (req, res) => {
    const reqId = req.params.id;
    const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
    if (!reqData) return res.status(404).json({ error: 'File request not found' });
    
    console.log(req.body)

    res.json({ message: 'File uploaded successfully' });
});

export default router;