import { randomUUID } from "crypto";
import { FileRequestSchemas } from "../../common/request-schemas";
import WorkerTools from "./WorkerTools";
import express from "express";
import { redis, prisma } from "../worker";
import path from "path";
import fs from "fs/promises";
import mime from "mime-types";

export default class FileRequestWorker {
    public static async CreateFileRequest(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const auth = await WorkerTools.AuthUser(req.headers.authorization);
        if (!auth) return { status: 401, body: { error: 'Unauthorized' } };
        const { user } = auth;


        try {
            const { error, value } = FileRequestSchemas.Create.validate(req.body);
            if (error) {
                return { status: 400, body: { error: error.details[0].message } };
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

            return { status: 201, body: reqData };

        } catch (error) {
            console.error('Error creating file request:', error);
            return { status: 500, body: { error: 'Failed to create file request' } };
        }
    }

    public static async GetSH(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) return {
            status: 404,
            body: `
                #!/bin/bash
                echo "Error: File request not found or has expired."
                exit 1
            `
        }

        return {
            status: 200,
            headers: { 'Content-Type': 'application/x-sh' },
            body: [
                '#!/bin/bash',
                '# File Upload Script (Chunked)',
                `# Usage: curl ${process.env.API_URL || req.protocol + '://' + req.host}/api/filereq/${reqId}/sh | bash -s -- --file myfile.txt`,
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
                `BASE_URL="${process.env.API_URL || req.protocol + '://' + req.host}/api/filereq/${reqId}"`,
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
                '  # Create temp file for response',
                '  TEMP_RESPONSE=$(mktemp)',
                '  ',
                '  # Upload chunk and capture HTTP code',
                '  HTTP_CODE=$(dd if="$FILE" bs=$CHUNK_SIZE skip=$((CHUNK_NUM - 1)) count=1 2>/dev/null | \\',
                '    curl -X PUT -T - -w "%{http_code}" -s -o "$TEMP_RESPONSE" "${AUTH_HEADER[@]}" "$BASE_URL/upload")',
                '  ',
                '  # Check if upload was successful',
                '  if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then',
                '    echo "Error: Failed to upload chunk $CHUNK_NUM/$TOTAL_CHUNKS (HTTP $HTTP_CODE)"',
                '    BODY=$(cat "$TEMP_RESPONSE")',
                '    [[ -n "$BODY" ]] && echo "Server response: $BODY"',
                '    rm -f "$TEMP_RESPONSE"',
                '    exit 1',
                '  fi',
                '  ',
                '  rm -f "$TEMP_RESPONSE"',
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
            ].filter(line => line !== '').join('\n')
        }
    }

    public static async GetPowerShell(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) return {
            status: 404,
            body: `
                Write-Host "Error: File request not found or has expired."
                exit 1
            `
        }

        return {
            status: 200,
            headers: { 'Content-Type': 'application/x-powershell' },
            body: [
                '# File Upload Script (Chunked)',
                `# Usage: iwr -useb ${process.env.API_URL || req.protocol + '://' + req.host}/api/filereq/${reqId}/ps1 | iex`,
                `# Or with args: & ([scriptblock]::Create((iwr -useb ${process.env.API_URL || req.protocol + '://' + req.host}/api/filereq/${reqId}/ps1))) -File "myfile.txt"`,
                '',
                'param(',
                '    [Parameter(Mandatory=$true)]',
                '    [string]$File,',
                '    ',
                '    [string]$SaveAs = "",' + (reqData.requireApiKey ? '' : ''),
                '    ',
                reqData.requireApiKey ? '    [Parameter(Mandatory=$true)]' : '',
                reqData.requireApiKey ? '    [string]$ApiKey,' : '',
                '    ',
                '    [switch]$Quiet',
                ')',
                '',
                '$ErrorActionPreference = "Stop"',
                '$ChunkSize = 5MB',
                '',
                '# Validate file exists',
                'if (-not (Test-Path $File)) {',
                '    Write-Error "File not found: $File"',
                '    exit 1',
                '}',
                '',
                '# Setup',
                '$FileInfo = Get-Item $File',
                '$FileName = if ($SaveAs) { $SaveAs } else { $FileInfo.Name }',
                '$FileSize = $FileInfo.Length',
                '$TotalChunks = [Math]::Ceiling($FileSize / $ChunkSize)',
                `$BaseUrl = "${process.env.API_URL || req.protocol + '://' + req.host}/api/filereq/${reqId}"`,
                '',
                reqData.requireApiKey ? '$Headers = @{ "Authorization" = "Bearer $ApiKey" }' : '$Headers = @{}',
                '',
                'if (-not $Quiet) {',
                '    Write-Host "Uploading $File ($FileSize bytes) as $FileName in $TotalChunks chunk(s)..."',
                '}',
                '',
                'try {',
                '    # Step 1: Initiate upload',
                '    if (-not $Quiet) { Write-Host "Initiating upload..." }',
                '    ',
                '    $InitHeaders = $Headers.Clone()',
                '    $InitHeaders["X-Filename"] = $FileName',
                '    ',
                '    $Response = Invoke-WebRequest -Uri "$BaseUrl/upload" -Method POST -Headers $InitHeaders -UseBasicParsing',
                '    ',
                '    if ($Response.StatusCode -ne 200) {',
                '        Write-Error "Failed to initiate upload (HTTP $($Response.StatusCode))"',
                '        exit 1',
                '    }',
                '    ',
                '    # Step 2: Upload chunks',
                '    $FileStream = [System.IO.File]::OpenRead($File)',
                '    $Buffer = New-Object byte[] $ChunkSize',
                '    $ChunkNum = 1',
                '    ',
                '    while ($FileStream.Position -lt $FileSize) {',
                '        if (-not $Quiet) { Write-Host "Uploading chunk $ChunkNum/$TotalChunks..." }',
                '        ',
                '        # Read chunk',
                '        $BytesRead = $FileStream.Read($Buffer, 0, $ChunkSize)',
                '        ',
                '        # Create temp file for chunk',
                '        $TempChunk = [System.IO.Path]::GetTempFileName()',
                '        [System.IO.File]::WriteAllBytes($TempChunk, $Buffer[0..($BytesRead-1)])',
                '        ',
                '        # Upload chunk',
                '        try {',
                '            $Response = Invoke-WebRequest -Uri "$BaseUrl/upload" -Method PUT -InFile $TempChunk -Headers $Headers -UseBasicParsing -ContentType "application/octet-stream"',
                '            ',
                '            if ($Response.StatusCode -notin @(200, 201)) {',
                '                Write-Error "Failed to upload chunk $ChunkNum/$TotalChunks (HTTP $($Response.StatusCode))"',
                '                if ($Response.Content) {',
                '                    Write-Host "Server response: $($Response.Content)"',
                '                }',
                '                exit 1',
                '            }',
                '        } catch {',
                '            $StatusCode = $_.Exception.Response.StatusCode.value__',
                '            Write-Error "Failed to upload chunk $ChunkNum/$TotalChunks (HTTP $StatusCode)"',
                '            if ($_.Exception.Response) {',
                '                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())',
                '                $responseBody = $reader.ReadToEnd()',
                '                Write-Host "Server response: $responseBody"',
                '            }',
                '            exit 1',
                '        } finally {',
                '            # Cleanup temp file',
                '            if (Test-Path $TempChunk) { Remove-Item $TempChunk -Force }',
                '        }',
                '        ',
                '        $ChunkNum++',
                '    }',
                '    ',
                '    $FileStream.Close()',
                '    ',
                '    # Step 3: Complete upload',
                '    if (-not $Quiet) { Write-Host "Finalizing upload..." }',
                '    ',
                '    $Response = Invoke-WebRequest -Uri "$BaseUrl/upload/complete" -Method POST -Headers $Headers -UseBasicParsing',
                '    ',
                '    if (-not $Quiet) {',
                '        Write-Host "Upload complete!"',
                '        Write-Host $Response.Content',
                '    }',
                '    ',
                '} catch {',
                '    Write-Error "Upload failed: $($_.Exception.Message)"',
                '    exit 1',
                '} finally {',
                '    if ($FileStream) { $FileStream.Close() }',
                '}',
                ''
            ].filter(line => line !== '').join('\n')
        }
    }

    public static async PostUpload(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) {
            return { status: 404, body: { error: 'File request not found' } };
        }

        if (reqData.requireApiKey) {
            const authHeader = req.headers['authorization'];
            const apiKey = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;
            if (!apiKey) return { status: 401, body: { error: 'API key required' } };

            const validKey = await prisma.authTokens.findFirst({
                where: {
                    token: apiKey,
                    isApi: true,
                }
            });

            if (!validKey) return { status: 403, body: { error: 'Invalid API key' } };
        }

        const tempDir = path.join(WorkerTools.getStorageDir(), '.temp');
        await fs.mkdir(tempDir, { recursive: true });

        await fs.writeFile(path.join(tempDir, `multipart_${reqId}`), '', { flag: 'w' });

        const fileName = reqData.filename || (req.headers['x-filename'] as string) || `filereq-${reqData.id}`;

        await redis.json.set(`filereq:${reqId}`, '$.filename', fileName);

        return { status: 200, body: { message: 'Upload started successfully' } };
    }

    public static async PutUploadChunk(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) return { status: 404, body: { error: 'File request not found' } };

        if (reqData.requireApiKey) {
            const authHeader = req.headers['authorization'];
            const apiKey = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;
            if (!apiKey) return { status: 401, body: { error: 'API key required' } };

            const validKey = await prisma.authTokens.findFirst({
                where: {
                    token: apiKey,
                    isApi: true,
                    userId: reqData.userId,
                }
            });

            if (!validKey) {
                return { status: 403, body: { error: 'Invalid API key' } };
            }
        }

        const bucket = await prisma.bucket.findUnique({
            where: { id: reqData.bucket },
            include: { owner: true }
        });

        if (!bucket) return { status: 500, body: { error: 'Bucket not found' } };

        const tempDir = path.join(WorkerTools.getStorageDir(), '.temp');
        const tempFilePath = path.join(tempDir, `multipart_${reqId}`);

        let fileSize = 0;
        try {
            const stat = await fs.stat(tempFilePath);
            fileSize = stat.size;
        } catch {
            fileSize = 0;
        }

        // Assume CheckUserQuota is a function you have available in scope
        const quotaValid = await WorkerTools.CheckUserQuota(bucket, fileSize + (req.body?.length || 0));
        if (!quotaValid) {
            await fs.unlink(tempFilePath).catch(() => { });
            return { status: 403, body: { error: "Quota exceeded, upload reset" } };
        }

        // req.body may be a Buffer or string depending on middleware
        await fs.appendFile(tempFilePath, req.body);

        await redis.expire(`filereq:${reqId}`, 1800); // Extend expiration

        return { status: 200, body: { message: 'Chunk uploaded successfully' } };
    }

    public static async PostCompleteUpload(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) return { status: 404, body: { error: 'File request not found' } };

        if (reqData.requireApiKey) {
            const authHeader = req.headers['authorization'];
            const apiKey = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;
            if (!apiKey) return { status: 401, body: { error: 'API key required' } };

            const validKey = await prisma.authTokens.findFirst({
                where: {
                    token: apiKey,
                    isApi: true,
                    userId: reqData.userId,
                }
            });

            if (!validKey) return { status: 403, body: { error: 'Invalid API key' } };
        }

        const tempDir = path.join(WorkerTools.getStorageDir(), '.temp');
        const tempFilePath = path.join(tempDir, `multipart_${reqId}`);

        const bucket = await prisma.bucket.findUnique({
            where: { id: reqData.bucket },
            include: { owner: true }
        });
        if (!bucket) {
            return { status: 500, body: { error: 'Bucket not found' } };
        }

        let fileSize = 0;
        try {
            const stat = await fs.stat(tempFilePath);
            fileSize = stat.size;
        } catch {
            fileSize = 0;
        }

        const quotaValid = await WorkerTools.CheckUserQuota(bucket, fileSize);

        if (!quotaValid) {
            await fs.unlink(tempFilePath).catch(() => { });
            return { status: 403, body: { error: "Quota exceeded, upload canceled" } };
        }

        // Guess mime type
        let mimeType = 'application/octet-stream';
        if (reqData.filename) {
            try {
                // Use 'mime-types' package if available, fallback otherwise
                mimeType = mime.lookup(reqData.filename) || 'application/octet-stream';
            } catch {
                mimeType = 'application/octet-stream';
            }
        }

        const newObject = await prisma.object.create({
            data: {
                bucketId: reqData.bucket,
                parentId: reqData.parent,
                filename: reqData.filename || `filereq-${reqData.id}`,
                mimeType,
                size: BigInt(fileSize),
            }
        });

        const destPath = WorkerTools.getObjectPath(bucket.name, newObject.id);
        await fs.rename(tempFilePath, destPath);

        await redis.json.del(`filereq:${reqId}`);

        return { status: 200, body: { message: 'Upload completed successfully' } };
    }

    public static async DeleteFileRequest(req: Worker.WorkerRequest): Promise<Worker.WorkerResponse> {
        await WorkerTools.ensureWorkerReady();

        const auth = await WorkerTools.AuthUser(req.headers.authorization);
        if (!auth) return { status: 401, body: { error: 'Unauthorized' } };
        const { user } = auth;

        const reqId = req.params.id;
        const reqData = await redis.json.get(`filereq:${reqId}`) as FileReq.FileRequest | null;
        if (!reqData) return { status: 404, body: { error: 'File request not found' } };

        if (reqData.userId !== user.id) return { status: 403, body: { error: 'Forbidden' } };

        await redis.json.del(`filereq:${reqId}`);

        return { status: 200, body: { message: 'File request deleted successfully' } };
    }
}