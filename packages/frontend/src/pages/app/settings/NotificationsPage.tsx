import {
  Typography,
  Box,
  Paper,
  FormGroup,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import { Notifications as NotificationsIcon } from '@mui/icons-material';
import { useState } from 'react';

export default function NotificationsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [uploadComplete, setUploadComplete] = useState(true);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [storageWarning, setStorageWarning] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Notification Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Manage your notification preferences
      </Typography>

      <Paper sx={{ p: 3, mt: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <NotificationsIcon color="primary" />
          <Typography variant="h6">Notification Preferences</Typography>
        </Box>
        <Divider sx={{ mb: 3 }} />

        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1">Email Notifications</Typography>
                <Typography variant="caption" color="text.secondary">
                  Receive notifications via email
                </Typography>
              </Box>
            }
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Transfer Notifications
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={uploadComplete}
                onChange={(e) => setUploadComplete(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Upload Complete</Typography>
                <Typography variant="caption" color="text.secondary">
                  Notify when uploads finish
                </Typography>
              </Box>
            }
            sx={{ mb: 1 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={downloadComplete}
                onChange={(e) => setDownloadComplete(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Download Complete</Typography>
                <Typography variant="caption" color="text.secondary">
                  Notify when downloads finish
                </Typography>
              </Box>
            }
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            System Notifications
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={storageWarning}
                onChange={(e) => setStorageWarning(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Storage Warnings</Typography>
                <Typography variant="caption" color="text.secondary">
                  Alert when storage is running low
                </Typography>
              </Box>
            }
            sx={{ mb: 1 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={securityAlerts}
                onChange={(e) => setSecurityAlerts(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Security Alerts</Typography>
                <Typography variant="caption" color="text.secondary">
                  Important security notifications
                </Typography>
              </Box>
            }
          />
        </FormGroup>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
          Note: These settings are stored locally and will be reset if you clear your browser data.
        </Typography>
      </Paper>
    </Box>
  );
}
