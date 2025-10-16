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

  namespace API {
    // ============================================
    // Generic API Types
    // ============================================
    
    // Generic error response
    interface Error {
      error: string;
    }

    // Health check
    interface Health {
      status: string;
      message: string;
    }
  }
}

export {};
