import axios from 'axios';
import { useAuthStore } from './states/authStore';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 5000,
    timeoutErrorMessage: 'The request took too long - please try again later.',
});

// Helper to get token from authStore
const getAuthToken = (): string => {
    const token = useAuthStore.getState().user?.token || localStorage.getItem('authToken');
    if (!token) throw new Error('Not authenticated');
    return token;
};

export const apiService = {
    // Health check
    health: async () => {
        const response = await api.get<API.Health>('/health');
        return response.data;
    },

    // Auth
    login: async (username: string, password: string, deviceIdentifier: string) => {
        const response = await api.post<Auth.Session>('/auth/login', { username, password, deviceIdentifier });
        return response.data;
    },

    me: async (authToken?: string) => {
        const token = authToken || getAuthToken();
        const response = await api.get<Auth.Session>('/auth/me', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    changePassword: async (currentPassword: string, newPassword: string) => {
        const token = getAuthToken();
        const response = await api.post<Auth.SuccessResponse>('/auth/change-password',
            { currentPassword, newPassword },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    // Buckets
    getBuckets: async () => {
        const token = getAuthToken();
        const response = await api.get<Models.BucketPublic[]>('/buckets', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    getBucket: async (id: string) => {
        const token = getAuthToken();
        const response = await api.get<Models.BucketPublic>(`/buckets/${id}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    createBucket: async (name: string, access?: 'private' | 'public-read' | 'public-write', storageQuota?: number) => {
        const token = getAuthToken();
        const response = await api.post<Models.BucketPublic>('/buckets',
            { name, access, storageQuota: storageQuota ?? -1 },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    updateBucket: async (id: string, data: { name?: string; access?: 'private' | 'public-read' | 'public-write'; storageQuota?: number }) => {
        const token = getAuthToken();
        const response = await api.put<Models.BucketPublic>(`/buckets/${id}`,
            data,
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    deleteBucket: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete<{ message: string }>(`/buckets/${id}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // Bucket Config
    getBucketConfig: async (bucketId: string) => {
        const token = getAuthToken();
        const response = await api.get<Config.BucketConfigItem[]>(`/buckets/${bucketId}/config`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateBucketConfigItem: async (bucketId: string, key: string, value: string) => {
        const token = getAuthToken();
        const response = await api.put<Config.BucketConfigItem>(`/buckets/${bucketId}/config/${key}`, { value }, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateBucketConfigItemsBulk: async (bucketId: string, items: Array<{ key: string; value: string, type?: 'STRING' | 'NUMBER' | 'BOOLEAN' }>) => {
        const token = getAuthToken();
        const response = await api.put<Config.BucketConfigItem[]>(`/buckets/${bucketId}/config`, items, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // Objects (Files/Folders)
    getObjects: async (bucketId: string, parentId?: string) => {
        const token = getAuthToken();
        const response = await api.get<Models.ObjectPublic[]>(`/objects/${bucketId}`, {
            headers: { Authorization: token },
            params: { parentId },
        });
        return response.data;
    },

    createFolder: async (bucketId: string, filename: string, parentId?: string) => {
        const token = getAuthToken();
        const response = await api.post<Models.ObjectPublic>('/objects/folder',
            { bucketId, filename, parentId },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    createFile: async (bucketId: string, filename: string, parentId?: string) => {
        const token = getAuthToken();
        const response = await api.post<Models.ObjectPublic>('/objects/file',
            { bucketId, filename, parentId },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    uploadFile: async (bucketId: string, file: File, parentId?: string) => {
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucketId', bucketId);
        if (parentId) formData.append('parentId', parentId);

        const response = await api.post<Models.ObjectPublic>('/objects/upload', formData, {
            headers: {
                Authorization: token,
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    deleteObject: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete<{ message: string }>(`/objects/${id}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    downloadFile: async (id: string) => {
        const token = getAuthToken();
        const response = await api.get(`/objects/${id}/download`, {
            headers: { Authorization: token },
            responseType: 'blob',
        });
        return response.data;
    },

    renameObject: async (id: string, newFilename: string) => {
        const token = getAuthToken();
        const response = await api.put<Models.ObjectPublic>(`/objects/${id}`,
            { filename: newFilename },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    getObjectContent: async (id: string) => {
        const token = getAuthToken();
        const response = await api.get(`/objects/${id}/content`, {
            headers: { Authorization: token },
        });
        return response.data;
    },

    saveObjectContent: async (id: string, content: string) => {
        const token = getAuthToken();
        const response = await api.put(`/objects/${id}/content`,
            { content },
            { headers: { Authorization: token } }
        );
        return response.data;
    },

    // Dashboard
    getDashboardStats: async () => {
        const token = getAuthToken();
        const response = await api.get<{
            totalBuckets: number;
            totalUsers: number;
            totalObjects: number;
            totalSize: number;
            storageQuota: number;
            recentBuckets: Array<{
                id: string;
                name: string;
                access: string;
                createdAt: string;
                objectCount: number;
            }>;
        }>('/dashboard/stats', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // Users (admin only)
    getUsers: async () => {
        const token = getAuthToken();
        const response = await api.get('/users', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    createUser: async (userData: { username: string; password: string; enabled: boolean; isAdmin: boolean; storageQuota: number }) => {
        const token = getAuthToken();
        const response = await api.post('/users', userData, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateUser: async (id: string, userData: Partial<{ username: string; password: string; enabled: boolean; isAdmin: boolean; storageQuota: number }>) => {
        const token = getAuthToken();
        const response = await api.put(`/users/${id}`, userData, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    deleteUser: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete(`/users/${id}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // Bucket name availability check
    checkBucketName: async (name: string) => {
        const token = getAuthToken();
        const response = await api.get(`/buckets/check/${name}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // Scheduled Tasks (admin only)
    getScheduleTasks: async () => {
        const token = getAuthToken();
        const response = await api.get('/schedule-tasks', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateScheduleTask: async (id: string, data: { enabled?: boolean; cron?: string }) => {
        const token = getAuthToken();
        const response = await api.patch(`/schedule-tasks/${id}`, data, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    runScheduleTask: async (id: string) => {
        const token = getAuthToken();
        const res = await api.post(`/schedule-tasks/${id}/run`, {}, {
            headers: { Authorization: token },
            timeout: 60000, // 60 seconds timeout for long-running tasks
        });
        return res.data;
    },

    // WebDAV Credentials
    getWebDAVCredentials: async () => {
        const token = getAuthToken();
        const response = await api.get('/credentials-webdav', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    createWebDAVCredential: async (bucketIds: string[]) => {
        const token = getAuthToken();
        const response = await api.post('/credentials-webdav', { bucketIds }, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateWebDAVCredential: async (id: string, bucketIds: string[]) => {
        const token = getAuthToken();
        const response = await api.put(`/credentials-webdav/${id}`, { bucketIds }, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    deleteWebDAVCredential: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete(`/credentials-webdav/${id}`, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // S3 Credentials
    getS3Credentials: async () => {
        const token = getAuthToken();
        const response = await api.get('/credentials-s3', {
            headers: { Authorization: token }
        });
        return response.data as Credentials.S3.Credential[];
    },

    createS3Credential: async (bucketIds: string[]) => {
        const token = getAuthToken();
        const response = await api.post('/credentials-s3', { bucketIds }, {
            headers: { Authorization: token }
        });
        return response.data as Credentials.S3.Credential;
    },

    updateS3Credential: async (id: string, bucketIds: string[]) => {
        const token = getAuthToken();
        const response = await api.put(`/credentials-s3/${id}`, { bucketIds }, {
            headers: { Authorization: token }
        });
        return response.data as Credentials.S3.Credential;
    },

    deleteS3Credential: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete(`/credentials-s3/${id}`, {
            headers: { Authorization: token }
        });
        return response.data as API.BasicResponse;
    },

    // API Credentials
    getApiCredentials: async () => {
        const token = getAuthToken();
        const response = await api.get('/credentials-api', {
            headers: { Authorization: token }
        });
        return response.data as Credentials.Api.Credential[];
    },

    createApiCredential: async (expiresInDays: number, description: string) => {
        const token = getAuthToken();
        const response = await api.post('/credentials-api', { expiresInDays, description }, {
            headers: { Authorization: token }
        });
        return response.data as Credentials.Api.Credential;
    },

    deleteApiCredential: async (id: string) => {
        const token = getAuthToken();
        const response = await api.delete(`/credentials-api/${id}`, {
            headers: { Authorization: token }
        });
        return response.data as API.BasicResponse;
    },

    // Config (admin only)
    getConfig: async () => {
        const token = getAuthToken();
        const response = await api.get<Config.ConfigItem[]>('/config', {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateConfigItem: async (key: string, value: string) => {
        const token = getAuthToken();
        const response = await api.put<Config.ConfigItem>(`/config/${key}`, { value }, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    updateConfigItemsBulk: async (items: Array<{ key: string; value: string }>) => {
        const token = getAuthToken();
        const response = await api.put<Config.ConfigItem[]>('/config', { configs: items }, {
            headers: { Authorization: token }
        });
        return response.data;
    },

    // File Requests
    createFileRequest: async (data: {
        bucket: string;
        parent: string | null;
        filename?: string;
        requireApiKey: boolean;
     }) => {
        const token = getAuthToken();
        const response = await api.post<FileReq.FileRequest>('/filereq', data, {
            headers: { Authorization: token }
        });
        return response.data;
    },
};

export default api;
