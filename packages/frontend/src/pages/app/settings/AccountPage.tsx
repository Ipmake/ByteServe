import {
  Typography,
  Box,
  Paper,
  TextField,
  Avatar,
  Divider,
  Grid,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Collapse,
  Alert,
} from "@mui/material";
import {
  AccountCircle as AccountIcon,
  DeleteForever,
  DeviceHub,
  Person,
} from "@mui/icons-material";
import { useAuthStore } from "../../../states/authStore";
import { useEffect, useState } from "react";
import { apiService } from "../../../api";
import RelativeDateDisplay from "../../../components/RelativeDateDisplay";

export default function AccountPage() {
  const { user } = useAuthStore();
  const [userTokens, setUserTokens] = useState<Auth.UserTokenView[]>([]);
  const [loadingTokens, setLoadingTokens] = useState<boolean>(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fetchUserTokens = async () => {
    setLoadingTokens(true);
    try {
      const response = await apiService.getTokens();
      setUserTokens(response);
    } catch (error) {
      console.error("Failed to fetch user tokens:", error);
    } finally {
      setLoadingTokens(false);
    }
  };

  useEffect(() => {
    fetchUserTokens();
  }, []);

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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
              <Person color="primary" />
              <Typography variant="h6">Personal Information</Typography>
            </Box>

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

        <Grid
          size={{
            xs: 12,
            md: 6,
          }}
        >
          <Paper sx={{ p: 3, mt: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
              <DeviceHub color="primary" />
              <Typography variant="h6">Logged In Devices</Typography>
            </Box>

            <Collapse in={!!tokenError} sx={{ mb: 2 }} unmountOnExit>
              <Alert severity="error">{tokenError}</Alert>
            </Collapse>
            {loadingTokens && <CircularProgress />}

            {!loadingTokens && (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Description</TableCell>
                    <TableCell>Created At</TableCell>
                    <TableCell>Expires At</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {userTokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell>{token.description}</TableCell>
                      <TableCell>
                        <RelativeDateDisplay date={token.createdAt} />
                      </TableCell>
                      <TableCell>
                        <RelativeDateDisplay date={token.expiresAt} />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => {
                            apiService.deleteToken(token.id).then(() => {
                              fetchUserTokens();
                            });
                          }}
                        >
                          <DeleteForever />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
