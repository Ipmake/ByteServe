# WebDAV Server Implementation

Custom WebDAV server implementation for FileGrave using Express.

## Structure

```
webdav/
├── index.ts              # Main entry point, sets up router and middleware
├── types.ts              # TypeScript interfaces and types
├── auth.ts               # HTTP Digest authentication
├── utils.ts              # Path parsing, XML generation utilities
└── handlers/
    ├── options.ts        # OPTIONS - WebDAV capabilities
    ├── propfind.ts       # PROPFIND - List files/directories
    ├── get.ts            # GET/HEAD - Download files and metadata
    ├── put.ts            # PUT - Upload files
    ├── delete.ts         # DELETE - Delete files/folders
    ├── mkcol.ts          # MKCOL - Create directories
    ├── move.ts           # MOVE - Move/rename files
    └── copy.ts           # COPY - Copy files/folders
```

## Features

- ✅ HTTP Digest Authentication
- ✅ Bucket-based access control
- ✅ Nested folder support
- ✅ Proper URL encoding for special characters
- ✅ XML generation using fast-xml-parser
- ✅ Full WebDAV method support (PROPFIND, GET, PUT, DELETE, MKCOL, MOVE, COPY)
- ✅ Legacy storage structure fallback

## Storage Structure

Files are stored in a hierarchical structure:

```
storage/
└── {bucketName}/
    ├── {folder1Id}/
    │   ├── {folder2Id}/
    │   │   └── {fileId}
    │   └── {fileId}
    └── {fileId}
```

Folders are both database records (with `mimeType='folder'`) and physical directories.

## Authentication

WebDAV credentials are stored in the `WebDAVCredential` table with access permissions defined in the `WebDAVBucketAccess` junction table.

## Usage

Mount WebDAV at any path:

```typescript
import { setupWebDAVServer } from './webdav';

setupWebDAVServer(app);
```

This mounts the WebDAV server at `/dav`.

## Client Connection

Connect using any WebDAV client:

```
URL: http://localhost:3001/dav
Username: your_username
Password: your_password
```

Compatible with:
- Dolphin (KDE file manager)
- Windows Explorer (Map Network Drive)
- macOS Finder (Connect to Server)
- VLC Media Player
- WinSCP
- Cyberduck
