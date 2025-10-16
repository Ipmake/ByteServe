import {
  Typography,
  Box,
  Paper,
  Divider,
  Alert,
} from '@mui/material';
import { AdminPanelSettings as AdminIcon } from '@mui/icons-material';
import { useAuthStore } from '../../../states/authStore';
import { Navigate } from 'react-router-dom';

export default function AdminPage() {
  const { user } = useAuthStore();

  if (!user?.isAdmin) {
    return <Navigate to="/app/settings/account" replace />;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Admin Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Administrative configuration and system management
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AdminIcon color="primary" />
          <Typography variant="h6">System Configuration</Typography>
        </Box>
        <Divider sx={{ mb: 3 }} />

        <Alert severity="info" sx={{ mb: 3 }}>
          This section is for administrators only. Additional admin features will be added in future updates.
        </Alert>

        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Quick Links
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            • Manage users from the Users page
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            • View system statistics on the Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            • Monitor storage usage in the Storage settings
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          System Information
        </Typography>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
            <Box component="span" sx={{ fontWeight: 600 }}>Version:</Box> 1.0.0
          </Typography>
          <Typography variant="body2" sx={{ mb: 1, color: 'text.primary' }}>
            <Box component="span" sx={{ fontWeight: 600 }}>Environment:</Box> Development
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.primary' }}>
            <Box component="span" sx={{ fontWeight: 600 }}>Database:</Box> PGlite (Embedded PostgreSQL)
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
