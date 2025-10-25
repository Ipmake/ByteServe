import { useState, useEffect } from "react";
import {
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  LinearProgress,
} from "@mui/material";
import {
  Storage as StorageIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
} from "@mui/icons-material";
import {
  formatBytes,
  calculateQuotaPercentage,
  getQuotaColor,
} from "../../../utils/format";
import { apiService } from "../../../api";

interface StorageStats {
  totalSize: number;
  totalObjects: number;
  totalBuckets: number;
  storageQuota: number;
}

export default function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStorageStats();
  }, []);

  const fetchStorageStats = async () => {
    try {
      const data = await apiService.getDashboardStats();
      setStats({
        totalSize: data.totalSize || 0,
        totalObjects: data.totalObjects || 0,
        totalBuckets: data.totalBuckets || 0,
        storageQuota: data.storageQuota ?? -1,
      });
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.message ||
          "Failed to fetch storage stats"
      );
    } finally {
      setLoading(false);
    }
  };

  const usagePercentage = stats
    ? calculateQuotaPercentage(stats.totalSize, stats.storageQuota)
    : 0;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Storage Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Monitor your storage usage and manage your data
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <StorageIcon color="primary" />
          <Typography variant="h6">Storage Overview</Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
          {stats?.storageQuota === -1 ? (
            <>
              <Typography variant="h4" fontWeight={600} gutterBottom>
                {formatBytes(stats?.totalSize || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unlimited storage quota
              </Typography>
            </>
          ) : (
            <>
              <Box
                sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {formatBytes(stats?.totalSize || 0)} of{" "}
                  {formatBytes(stats?.storageQuota || 0)} used
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {usagePercentage.toFixed(2)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={usagePercentage}
                color={getQuotaColor(usagePercentage)}
                sx={{ height: 10, borderRadius: 5 }}
              />
              {usagePercentage >= 90 && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  You are running out of storage space. Please delete some files
                  or contact an administrator.
                </Alert>
              )}
              {usagePercentage >= 75 && usagePercentage < 90 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  You have used over 75% of your storage quota.
                </Alert>
              )}
            </>
          )}
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <StorageIcon color="primary" />
                  <Typography variant="body2" color="text.secondary">
                    Total Storage
                  </Typography>
                </Box>
                <Typography variant="h5">
                  {formatBytes(stats?.totalSize || 0)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <FolderIcon color="primary" />
                  <Typography variant="body2" color="text.secondary">
                    Total Buckets
                  </Typography>
                </Box>
                <Typography variant="h5">{stats?.totalBuckets || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <Card variant="outlined">
              <CardContent>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <FileIcon color="primary" />
                  <Typography variant="body2" color="text.secondary">
                    Total Files
                  </Typography>
                </Box>
                <Typography variant="h5">{stats?.totalObjects || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
