declare global {
    namespace Models {
        interface Config {
            key: string;
            value: string;
        }
        interface BaseUser {
            id: string;
            username: string;
        }
        interface User extends BaseUser {
            password: string;
            enabled: boolean;
            isAdmin: boolean;
            storageQuota: number;
            createdAt: Date;
            updatedAt: Date;
        }
        interface UserPublic extends BaseUser {
            enabled: boolean;
            isAdmin: boolean;
            storageQuota: number;
            createdAt: string;
            updatedAt: string;
        }
        interface AuthToken {
            id: string;
            userId: string;
            token: string;
            expiresAt: Date;
            createdAt: Date;
            isApi: boolean;
        }
        interface Bucket {
            id: string;
            name: string;
            access: 'private' | 'public-read' | 'public-write';
            storageQuota: number;
            ownerId: string;
            createdAt: Date;
            updatedAt: Date;
        }
        interface BucketPublic {
            id: string;
            name: string;
            access: 'private' | 'public-read' | 'public-write';
            storageQuota: number;
            ownerId: string;
            createdAt: string;
            updatedAt: string;
            objectCount: number;
            usedStorage?: number;
        }
        interface ObjectModel {
            id: string;
            bucketId: string;
            filename: string;
            size: number;
            mimeType: string;
            parentId: string | null;
            createdAt: Date;
            updatedAt: Date;
        }
        interface ObjectPublic {
            id: string;
            bucketId: string;
            filename: string;
            size: number;
            mimeType: string;
            parentId: string | null;
            createdAt: string;
            updatedAt: string;
            isFolder: boolean;
        }
    }
    namespace Auth {
        interface Session extends Models.BaseUser {
            token: string;
            isApi: boolean;
            isAdmin: boolean;
            storageQuota: number;
        }
        interface Credentials {
            username: string;
            password: string;
        }
        interface PasswordChange {
            currentPassword: string;
            newPassword: string;
        }
        interface SuccessResponse {
            message: string;
        }
    }
    namespace Credentials {
        namespace S3 {
            interface Credential {
                id: string;
                userId: string;
                accessKey: string;
                secretKey: string;
                createdAt: string;
                updatedAt: string;
                bucketAccess: Array<{
                    id: string;
                    name: string;
                }>;
            }
        }
        namespace Api {
            interface Credential {
                id: string;
                userId: string;
                description: string;
                token: string;
                expiresAt: string;
                createdAt: string;
                isApi: boolean;
            }
        }
    }
    namespace API {
        interface Error {
            error: string;
        }
        interface Health extends BasicResponse {
            status: string;
        }
        interface BasicResponse {
            message: string;
        }
    }
}
export {};
