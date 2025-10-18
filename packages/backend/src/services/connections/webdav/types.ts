export interface WebDAVUser {
    username: string;
    bucketIds: string[];
    userId: string;
}

export interface ParsedPath {
    bucket: string | null;
    objectPath: string;
}
