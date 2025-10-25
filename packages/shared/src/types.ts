declare global {
  namespace Models {
    // ============================================
    // Config Model
    // ============================================
    interface Config {
      key: string;
      value: string;
    }

    // ============================================
    // User Models
    // ============================================
    interface BaseUser {
      id: string;
      username: string;
    }

    // Full User model from Prisma
    interface User extends BaseUser {
      password: string;
      enabled: boolean;
      isAdmin: boolean;
      storageQuota: number; // -1 for unlimited
      createdAt: Date;
      updatedAt: Date;
    }

    // User for API responses (excludes sensitive data)
    interface UserPublic extends BaseUser {
      enabled: boolean;
      isAdmin: boolean;
      storageQuota: number; // -1 for unlimited
      createdAt: string;
      updatedAt: string;
    }

    // ============================================
    // AuthTokens Model
    // ============================================
    interface AuthToken {
      id: string;
      userId: string;
      token: string;
      expiresAt: Date;
      createdAt: Date;
      isApi: boolean;
    }

    // ============================================
    // Bucket Models
    // ============================================
    interface Bucket {
      id: string;
      name: string;
      access: 'private' | 'public-read' | 'public-write';
      storageQuota: number; // -1 for unlimited
      ownerId: string;
      createdAt: Date;
      updatedAt: Date;
    }

    // Bucket for API responses
    interface BucketPublic {
      id: string;
      name: string;
      access: 'private' | 'public-read' | 'public-write';
      storageQuota: number; // -1 for unlimited
      ownerId: string;
      createdAt: string;
      updatedAt: string;
      objectCount: number;
      usedStorage?: number;
    }

    // ============================================
    // Object Models (Files/Folders)
    // ============================================
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

    // Object for API responses
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
    // ============================================
    // Authentication Types
    // ============================================

    // Authenticated user session with token
    interface Session extends Models.BaseUser {
      token: string;
      isApi: boolean;
      isAdmin: boolean;
      storageQuota: number; // -1 for unlimited
    }

    // Login credentials
    interface Credentials {
      username: string;
      password: string;
    }

    // Password change request
    interface PasswordChange {
      currentPassword: string;
      newPassword: string;
    }

    // Generic success response
    interface SuccessResponse {
      message: string;
    }
  }


  namespace Credentials {

    // ============================================
    // Credential Models
    // ============================================

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

  namespace Config {
    interface ConfigItem {
      key: string;
      value: string;
      category: string;
      description: string | null;
      type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
      selectOptions: string[]; // When type is not SELECT, this will be auto suggestions
    }

    interface BucketConfigItem {
      bucketId: string;
      key: string;
      value: string;
      type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
    }
  }

  namespace FileReq {
    interface FileRequest {
      id: string;
      bucket: string;
      parent: string | null;
      filename: string | null;
      userId: string;
      requireApiKey: boolean;
      createdAt: number;
    }
  }

  namespace Worker {
    interface WorkerRequest {
      headers: Record<string, string>; // HTTP headers
      method: string;                 // HTTP method (GET, POST, etc.)
      params: Record<string, string>; // URL parameters
      query: Record<string, string>;  // Query parameters
      body: any;                      // Request body

      path: string;
      originalUrl: string;
      protocol: string;
    }

    interface WorkerResponse {
      status: number; // HTTP status code
      body: any;   // Response body
      headers?: Record<string, string>; // Optional headers
    }
  }

  namespace Stats {
    interface BucketStatsInRedis {
      bucketId: string;

      apiRequestsServed: number;
      s3RequestsServed: number;
      webdavRequestsServed: number;

      bytesServed: number;
      requestsCount: number;
    }

    interface DailyUserBucketStats {
      bytesServed: number;
      requestsCount: number;
      apiRequestsCount: number;
      s3RequestsCount: number;
      webdavRequestsCount: number;
      usedSpace: number;
      objectCount: number;
    }
  }

  namespace API {
    // ============================================
    // Generic API Types
    // ============================================

    // Generic error response
    interface Error {
      error: string;
    }

    // Health check
    interface Health extends BasicResponse {
      status: string;
    }

    interface BasicResponse {
      message: string;
    }
  }
}

export { };
