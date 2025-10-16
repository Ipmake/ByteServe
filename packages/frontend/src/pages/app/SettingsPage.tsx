import { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  TextField,
  Button,
  Alert,
  Divider,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import { Lock as LockIcon, Storage as StorageIcon } from '@mui/icons-material';
import { SHA256 } from 'crypto-js';
import { apiService } from '../../api';
import { formatBytes, calculateQuotaPercentage, getQuotaColor } from '../../utils/format';

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<Auth.Session | null>(null);
  const [storageUsed, setStorageUsed] = useState<number>(0);
  const [loadingStorage, setLoadingStorage] = useState(true);

  useEffect(() => {
    fetchUserInfo();
    fetchStorageUsage();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const session = await apiService.me();
      setUserInfo(session);
    } catch (err) {
      console.error('Failed to fetch user info:', err);
    }
  };

  const fetchStorageUsage = async () => {
    setLoadingStorage(true);
    try {
      // Get all buckets and sum up their usedStorage
      const buckets = await apiService.getBuckets();
      const totalUsed = buckets.reduce((sum, bucket) => sum + (bucket.usedStorage || 0), 0);
      setStorageUsed(totalUsed);
    } catch (err) {
      console.error('Failed to fetch storage usage:', err);
    } finally {
      setLoadingStorage(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // Hash passwords on the client side
      const hashPassword = (password: string) => {
        return SHA256(`filegrave${password}filegrave`).toString();
      };

      const currentPasswordHash = hashPassword(currentPassword);
      const newPasswordHash = hashPassword(newPassword);

      const response = await apiService.changePassword(
        currentPasswordHash,
        newPasswordHash
      ).catch((err) => {
        throw new Error(err.message || 'Failed to change password');
      });

      setSuccess(response.message || 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      {/* Storage Quota Section */}
      <Paper sx={{ p: 3, mt: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <StorageIcon color="primary" />
          <Typography variant="h6">Storage Quota</Typography>
        </Box>
        <Divider sx={{ mb: 3 }} />

        {loadingStorage ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : userInfo ? (
          <Box>
            {userInfo.storageQuota === -1 ? (
              <Box>
                <Typography variant="h4" fontWeight={600} color="primary">
                  {formatBytes(storageUsed)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Unlimited storage quota
                </Typography>
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 2 }}>
                  <Typography variant="h4" fontWeight={600}>
                    {formatBytes(storageUsed)}
                  </Typography>
                  <Typography variant="h6" color="text.secondary">
                    / {formatBytes(userInfo.storageQuota)}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={calculateQuotaPercentage(storageUsed, userInfo.storageQuota)}
                  color={getQuotaColor(calculateQuotaPercentage(storageUsed, userInfo.storageQuota))}
                  sx={{ height: 10, borderRadius: 1, mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {calculateQuotaPercentage(storageUsed, userInfo.storageQuota)}% of quota used
                </Typography>
                {calculateQuotaPercentage(storageUsed, userInfo.storageQuota) >= 90 && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    You are running out of storage space. Please delete some files or contact an administrator.
                  </Alert>
                )}
                {calculateQuotaPercentage(storageUsed, userInfo.storageQuota) >= 75 && 
                 calculateQuotaPercentage(storageUsed, userInfo.storageQuota) < 90 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    You have used over 75% of your storage quota.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        ) : (
          <Typography color="text.secondary">Unable to load storage information</Typography>
        )}
      </Paper>

      {/* Change Password Section */}
      <Paper sx={{ p: 3, mt: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <LockIcon color="primary" />
          <Typography variant="h6">Change Password</Typography>
        </Box>
        <Divider sx={{ mb: 3 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Current Password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          sx={{ mb: 3 }}
        />

        <Button
          variant="contained"
          fullWidth
          onClick={handleChangePassword}
          disabled={loading}
        >
          {loading ? 'Changing Password...' : 'Change Password'}
        </Button>
      </Paper>
    </Box>
  );
}
