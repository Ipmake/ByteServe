import {
  Typography,
  Box,
  Paper,
  TextField,
  Avatar,
  Divider,
  Grid,
} from "@mui/material";
import { AccountCircle as AccountIcon } from "@mui/icons-material";
import { useAuthStore } from "../../../states/authStore";

export default function AccountPage() {
  const { user } = useAuthStore();

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Account Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Manage your account information and preferences
      </Typography>

      <Grid container spacing={3} sx={{ mt: 1 }}>
        <Grid
          size={{
            xs: 12,
            md: 6,
          }}
        >
          <Paper sx={{ p: 3, mt: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
              <Avatar sx={{ width: 80, height: 80, bgcolor: "primary.main" }}>
                <AccountIcon sx={{ fontSize: 48 }} />
              </Avatar>
              <Box>
                <Typography variant="h6">{user?.username}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {user?.isAdmin ? "Administrator" : "User"}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Profile Information
            </Typography>

            <TextField
              fullWidth
              label="Username"
              value={user?.username || ""}
              disabled
              sx={{ mt: 2, mb: 2 }}
              helperText="Username cannot be changed"
            />

            <TextField
              fullWidth
              label="User ID"
              value={user?.id || ""}
              disabled
              sx={{ mb: 2 }}
              helperText="Unique identifier for your account"
            />

            <TextField
              fullWidth
              label="Role"
              value={user?.isAdmin ? "Administrator" : "Standard User"}
              disabled
              sx={{ mb: 3 }}
            />

            <Typography variant="caption" color="text.secondary">
              To update your account information, please contact an
              administrator.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
