import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./states/authStore";
import { useEffect, useState } from "react";
import { apiService } from "./api";
import { Box, CircularProgress } from "@mui/material";
import Login from "./pages/Login";
import AppLayout from "./layouts/AppLayout";
import DashboardPage from "./pages/app/DashboardPage";
import BucketsPage from "./pages/app/BucketsPage";
import FileBrowserPage from "./pages/app/FileBrowserPage";
import ImageViewerPage from "./pages/app/ImageViewerPage";
import TextEditorPage from "./pages/app/TextEditorPage";
import VideoViewerPage from "./pages/app/VideoViewerPage";
import UsersPage from "./pages/app/UsersPage";
import WebDAVPage from "./pages/app/credentials/WebDAVPage";
import AccountPage from "./pages/app/settings/AccountPage";
import SecurityPage from "./pages/app/settings/SecurityPage";
import StoragePage from "./pages/app/settings/StoragePage";
import AdminPage from "./pages/app/settings/AdminPage";
import ScheduleTasksPage from "./pages/app/settings/ScheduleTasksPage";
import S3Page from "./pages/app/credentials/S3Page";

function App() {
  const { user, setUser } = useAuthStore();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const authToken = localStorage.getItem("authToken");

    if (!authToken) return setIsLoaded(true);

    // Fetch user data with the token
    apiService
      .me(authToken)
      .then((data) => {
        setUser(data);
      })
      .catch((err) => {
        console.error("Failed to fetch user data:", err);
        localStorage.removeItem("authToken");
      })
      .finally(() => setIsLoaded(true));
  }, []);

  if (!isLoaded)
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );

  if (!user) return <Login />;

  return (
    <Routes>
      {/* Standalone viewer routes (no layout) */}
      <Route path="/viewer/image/:objectId" element={<ImageViewerPage />} />
      <Route path="/viewer/text/:objectId" element={<TextEditorPage />} />
      <Route path="/viewer/video/:objectId" element={<VideoViewerPage />} />
      
      {/* App routes with layout */}
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="buckets" element={<BucketsPage />} />
        <Route path="buckets/:bucketId" element={<FileBrowserPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="credentials">
          <Route path="webdav" element={<WebDAVPage />} />
          <Route path="s3" element={<S3Page />} />
          <Route index element={<Navigate to="/app/credentials/webdav" replace />} />
        </Route>
        <Route path="settings">
          <Route path="account" element={<AccountPage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="storage" element={<StoragePage />} />
          <Route path="schedule-tasks" element={<ScheduleTasksPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route index element={<Navigate to="/app/settings/account" replace />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default App;
