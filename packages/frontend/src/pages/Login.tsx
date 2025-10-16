import { useState } from "react";
import {
  Container,
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
} from "@mui/material";
import { FolderOpen as FolderIcon } from "@mui/icons-material";
import axios from "axios";
import { useAuthStore } from "../states/authStore";
import { SHA256 } from "crypto-js";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Simple validation
    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post("/api/auth/login", {
        username,
        password: SHA256(`filegrave${password}filegrave`).toString(),
      });

      // Store the token and user info
      localStorage.setItem("authToken", response.data.token);

      useAuthStore.getState().setUser({
        id: response.data.id,
        username: response.data.username,
        token: response.data.token,
        isApi: false,
        isAdmin: response.data.isAdmin,
        storageQuota: response.data.storageQuota,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #121212 0%, #1e1e1e 100%)",
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={3}
          sx={{
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Box
            sx={{
              mb: 2,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <FolderIcon sx={{ fontSize: 40, color: "primary.main" }} />
            <Typography variant="h4" component="h1">
              FileGrave
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sign in to your account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%" }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.2 }}
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In"}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default Login;
