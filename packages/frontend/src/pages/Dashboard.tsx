import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  AppBar,
  Toolbar,
  IconButton,
  Chip,
} from '@mui/material';
import {
  People as PeopleIcon,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../api';

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users] = useState<Models.UserPublic[]>([]);
  const [healthStatus, setHealthStatus] = useState<string>('');

  useEffect(() => {
    checkHealth();
    fetchData();
  }, []);

  const checkHealth = async () => {
    try {
      const data = await apiService.health();
      setHealthStatus(data.message);
    } catch (err) {
      console.error('Health check failed:', err);
      setHealthStatus('Backend connection failed');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
    } catch (err) {
      setError('Failed to fetch data. Make sure the backend is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <PeopleIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            ByteServe - User Management
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {healthStatus}
          </Typography>
          <IconButton color="inherit" onClick={handleLogout} title="Logout">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Stats Card */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PeopleIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Total Users</Typography>
                </Box>
                <Typography variant="h3">{users.length}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {users.filter(u => u.isAdmin).length} admin(s), {users.filter(u => !u.isAdmin).length} regular user(s)
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PersonIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Active Users</Typography>
                </Box>
                <Typography variant="h3">{users.filter(u => u.enabled).length}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {users.filter(u => !u.enabled).length} disabled
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Users List */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5">Users</Typography>
                <Button variant="contained" onClick={fetchData} disabled={loading}>
                  Refresh
                </Button>
              </Box>

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : users.length === 0 ? (
                <Typography color="text.secondary">No users found</Typography>
              ) : (
                <Grid container spacing={2}>
                  {users.map((user) => (
                    <Grid item xs={12} sm={6} md={4} key={user.id}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="h6">
                              {user.username}
                            </Typography>
                            {user.isAdmin && (
                              <AdminIcon color="primary" fontSize="small" />
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {user.isAdmin && (
                              <Chip label="Admin" color="primary" size="small" />
                            )}
                            {user.enabled ? (
                              <Chip label="Active" color="success" size="small" />
                            ) : (
                              <Chip label="Disabled" color="error" size="small" />
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Created: {new Date(user.createdAt).toLocaleDateString()}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default Dashboard;
