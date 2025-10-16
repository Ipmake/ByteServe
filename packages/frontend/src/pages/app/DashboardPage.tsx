import { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  InsertDriveFile,
  Folder,
  People,
  Storage as StorageIcon,
  Lock,
  LockOpen,
  Edit,
} from '@mui/icons-material';
import { useAuthStore } from '../../states/authStore';
import { useNavigate } from 'react-router-dom';
import { formatBytes, calculateQuotaPercentage, getQuotaColor } from '../../utils/format';
import { apiService } from '../../api';

interface DashboardStats {
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
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const data = await apiService.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch dashboard stats');
    } finally {
      setLoading(false);
    }
  };



  const getAccessIcon = (access: string) => {
    switch (access) {
      case 'private':
        return <Lock fontSize="small" />;
      case 'public-read':
        return <LockOpen fontSize="small" />;
      case 'public-write':
        return <Edit fontSize="small" />;
      default:
        return <Lock fontSize="small" />;
    }
  };

  const getAccessColor = (access: string) => {
    switch (access) {
      case 'private':
        return 'error';
      case 'public-read':
        return 'info';
      case 'public-write':
        return 'success';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Welcome back, {user?.username}! Here's an overview of your storage.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/app/buckets')}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Folder sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Buckets</Typography>
              </Box>
              <Typography variant="h4">{stats?.totalBuckets || 0}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total buckets
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {user?.isAdmin && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/app/users')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <People sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Users</Typography>
                </Box>
                <Typography variant="h4">{stats?.totalUsers || 0}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total users
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/app/settings')}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <StorageIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">Storage</Typography>
              </Box>
              {stats?.storageQuota === -1 ? (
                <>
                  <Typography variant="h4">{formatBytes(stats?.totalSize || 0)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Unlimited quota
                  </Typography>
                </>
              ) : (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 1 }}>
                    <Typography variant="h4">{formatBytes(stats?.totalSize || 0)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      / {formatBytes(stats?.storageQuota || 0)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={calculateQuotaPercentage(stats?.totalSize || 0, stats?.storageQuota || 0)}
                    color={getQuotaColor(calculateQuotaPercentage(stats?.totalSize || 0, stats?.storageQuota || 0))}
                    sx={{ mb: 1, height: 6, borderRadius: 1 }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <InsertDriveFile sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="h6">Files</Typography>
              </Box>
              <Typography variant="h4">{stats?.totalObjects || 0}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total objects
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ mt: 3, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Buckets
        </Typography>
        {stats?.recentBuckets && stats.recentBuckets.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Access</TableCell>
                  <TableCell align="right">Objects</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stats.recentBuckets.map((bucket) => (
                  <TableRow
                    key={bucket.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/app/buckets/${bucket.id}`)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Folder fontSize="small" color="primary" />
                        <Typography variant="body2">{bucket.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getAccessIcon(bucket.access)}
                        label={bucket.access}
                        size="small"
                        color={getAccessColor(bucket.access) as any}
                      />
                    </TableCell>
                    <TableCell align="right">{bucket.objectCount}</TableCell>
                    <TableCell>
                      {new Date(bucket.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No buckets yet. Create your first bucket to get started!
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
