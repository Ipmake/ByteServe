import { PrismaClient } from "@prisma/client";
import { createClient as createRedisClient } from "redis";

import FileRequestWorker from "./classes/FileRequest";
import StorageWorker from "./classes/Storage";
import S3Worker from "./classes/S3";

const prisma = new PrismaClient({});
const redis = createRedisClient({
    url: process.env.REDIS_URL
});

export { prisma, redis };

//#region Exports

// Storage Worker Exports
export const StorageWorker_PublicFileAccess = StorageWorker.PublicFileAccess;

// File Request Worker Exports
export const FileRequestWorker_CreateFileRequest = FileRequestWorker.CreateFileRequest;
export const FileRequestWorker_GetSH = FileRequestWorker.GetSH;
export const FileRequestWorker_GetPowerShell = FileRequestWorker.GetPowerShell;
export const FileRequestWorker_PostUpload = FileRequestWorker.PostUpload;
export const FileRequestWorker_PutUploadChunk = FileRequestWorker.PutUploadChunk;
export const FileRequestWorker_PostCompleteUpload = FileRequestWorker.PostCompleteUpload;
export const FileRequestWorker_DeleteFileRequest = FileRequestWorker.DeleteFileRequest;

// S3 Worker Exports
export const S3WorkerHandlers_DeleteObject = S3Worker.DeleteObject;
export const S3WorkerHandlers_GetObject = S3Worker.GetObject;
export const S3WorkerHandlers_ListBuckets = S3Worker.ListBuckets;
export const S3WorkerHandlers_ListObjectsV2 = S3Worker.ListObjectsV2;
export const S3WorkerHandlers_PostMultiPartUpload = S3Worker.PostMultiPartUpload;
export const S3WorkerHandlers_PutMultiPartUpload = S3Worker.PutMultiPartUpload;

//#endregion