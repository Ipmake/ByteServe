import { useEffect, useState } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  useTheme,
  alpha,
  Collapse,
} from "@mui/material";
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import bowser from "bowser";
import { useAuthStore } from "../states/authStore";
import { SHA256 } from "crypto-js";
import { apiService } from "../api";
import useInfoStore from "../states/infoStore";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const theme = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      const browserData = bowser.getParser(window.navigator.userAgent);
      const response = await apiService.login(
        username,
        SHA256(`byteserve${password}byteserve`).toString(),
        `${browserData.getBrowserName()} on ${browserData.getOSName()}`.slice(
          0,
          128
        )
      );

      localStorage.setItem("authToken", response.token);

      useAuthStore.getState().setUser({
        id: response.id,
        username: response.username,
        token: response.token,
        isApi: false,
        isAdmin: response.isAdmin,
        storageQuota: response.storageQuota,
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

  useEffect(() => {
    setError("");
  }, [username, password]);

  const { info } = useInfoStore();

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        position: "relative",
        // Background image for entire container
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "url(/background/actionvance-t7EL2iG3jMc-unsplash.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.4)",
          zIndex: 0,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, ${alpha(
            theme.palette.primary.dark,
            0.15
          )} 0%, ${alpha("#000", 0.1)} 100%)`,
          zIndex: 0,
        },
      }}
    >
      {/* Left Side - Image & Branding */}
      <Box
        sx={{
          flex: 1,
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          p: 6,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: (theme) => theme.palette.background.default,
              }}
            >
              <img
                src="/icon.png"
                alt="Logo"
                style={{ width: 32, height: 32 }}
              />
            </Box>
            <Typography
              variant="h5"
              fontWeight={700}
              color="white"
              fontSize={24}
            >
              {info?.app || "ByteServe"}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ position: "relative", zIndex: 1 }}>
          <Typography variant="h3" fontWeight={700} color="white" gutterBottom>
            OpenSource Object Storage
          </Typography>
          <Typography
            variant="h6"
            color="rgba(255, 255, 255, 0.9)"
            sx={{ maxWidth: 500 }}
          >
            Fast, reliable, and easy-to-use self-hosted object storage solution
            for all your data needs.
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 3,
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: 11,
            }}
          >
            Photo by{" "}
            <a
              href="https://unsplash.com/@actionvance"
              target="_blank"
              style={{
                color: "rgba(255, 255, 255, 0.6)",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              ActionVance
            </a>{" "}
            on{" "}
            <a
              href="https://unsplash.com/"
              target="_blank"
              style={{
                color: "rgba(255, 255, 255, 0.6)",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              Unsplash
            </a>
          </Typography>
        </Box>
      </Box>

      {/* Right Side - Login Form */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
          bgcolor: "background.default",
          borderTopLeftRadius: { xs: 0, md: 48 },
          borderBottomLeftRadius: { xs: 0, md: 48 },
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 440 }}>
          <Box sx={{ mb: 5 }}>
            <Typography variant="h4" fontWeight={600} gutterBottom>
              Welcome back
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Sign in to your account to continue
            </Typography>
          </Box>

          <Collapse in={!!error} sx={{ mb: 3 }} unmountOnExit>
            <Alert severity="error" sx={{ borderRadius: 1.5 }}>
              {error}
            </Alert>
          </Collapse>

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              sx={{ mb: 4 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              size="large"
              sx={{
                py: 1.5,
                textTransform: "none",
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 1.5,
              }}
            >
              {loading ? "Signing In..." : "Sign In"}
            </Button>
          </Box>

          <Box sx={{ mt: 4, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              Powered by a self-hosted instance of&nbsp;
              <a
                href="https://github.com/Ipmake/ByteServe"
                style={{
                  color: "inherit",
                  textDecoration: "none",
                  fontWeight: "bold",
                }}
                target="_blank"
                rel="noopener noreferrer"
              >
                ByteServe {info?.version || "vX.X.X"}
              </a>
              .
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default Login;
