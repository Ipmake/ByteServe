import { JSX, useState } from "react";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  LinearProgress,
  Tooltip,
  Collapse,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  Folder as FolderIcon,
  Logout as LogoutIcon,
  SwapVert as TransferIcon,
  ExpandLess,
  ExpandMore,
  AccountCircle as AccountIcon,
  Lock as LockIcon,
  Storage as StorageIcon,
  AdminPanelSettings as AdminIcon,
  VpnKey as KeyIcon,
  CloudSync as WebDAVIcon,
  Schedule as ScheduleIcon,
  AppRegistration as S3Icon,
  BrowserUpdated as ApiIcon,
} from "@mui/icons-material";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../states/authStore";
import { useTransferStore } from "../store/transferStore";
import TransferManager from "../components/TransferManager";
import { apiService } from "../api";
import useInfoStore from "../states/infoStore";

const drawerWidth = 240;

interface NavItem {
  text: string;
  icon: JSX.Element;
  path?: string;
  adminOnly?: boolean;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { text: "Dashboard", icon: <DashboardIcon />, path: "/app" },
  { text: "Buckets", icon: <FolderIcon />, path: "/app/buckets" },
  { text: "Users", icon: <PeopleIcon />, path: "/app/users", adminOnly: true },
  {
    text: "Credentials",
    icon: <KeyIcon />,
    children: [
      { text: "API", icon: <ApiIcon />, path: "/app/credentials/api" },
      { text: "S3", icon: <S3Icon />, path: "/app/credentials/s3" },
      { text: "WebDAV", icon: <WebDAVIcon />, path: "/app/credentials/webdav" },
    ],
  },
  {
    text: "Settings",
    icon: <SettingsIcon />,
    children: [
      { text: "Account", icon: <AccountIcon />, path: "/app/settings/account" },
      { text: "Security", icon: <LockIcon />, path: "/app/settings/security" },
      { text: "Storage", icon: <StorageIcon />, path: "/app/settings/storage" },
      {
        text: "Scheduled Tasks",
        icon: <ScheduleIcon />,
        path: "/app/settings/schedule-tasks",
        adminOnly: true,
      },
      {
        text: "Admin",
        icon: <AdminIcon />,
        path: "/app/settings/admin",
        adminOnly: true,
      },
    ],
  },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuthStore();
  const { transfers, toggleOpen } = useTransferStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { info } = useInfoStore();

  // Auto-expand settings if on a settings page
  const isSettingsPage = location.pathname.startsWith("/app/settings");
  const [settingsOpen, setSettingsOpen] = useState(isSettingsPage);

  // Auto-expand credentials if on a credentials page
  const isCredentialsPage = location.pathname.startsWith("/app/credentials");
  const [credentialsOpen, setCredentialsOpen] = useState(isCredentialsPage);

  // Filter nav items based on admin status
  const filteredNavItems = navItems
    .map((item) => {
      if (item.children) {
        return {
          ...item,
          children: item.children.filter(
            (child) => !child.adminOnly || user?.isAdmin
          ),
        };
      }
      return item;
    })
    .filter((item) => !item.adminOnly || user?.isAdmin);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    await apiService.logout();
    localStorage.removeItem("authToken");
    setUser(null);
  };

  const activeTransfers = transfers.filter(
    (t) => t.status === "active" || t.status === "pending"
  );

  const totalProgress =
    activeTransfers.length > 0
      ? activeTransfers.reduce((sum, t) => sum + t.progress, 0) /
        activeTransfers.length
      : 0;

  const drawer = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Toolbar sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "12px"
      }}>
        <img
          src="/icon.png"
          alt="ByteServe Icon"
          style={{ width: 24, height: 24 }}
        />
        <Tooltip
          title={`ByteServe V${info?.version || "N/A"}`}
          placement="right"
          arrow
        >
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              pointer: "default",
            }}
          >
            {info?.app || "ByteServe"}
          </Typography>
        </Tooltip>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1, pt: 2 }}>
        {filteredNavItems.map((item) => {
          if (item.children) {
            // Expandable menu item (Settings, Credentials, etc.)
            const isActive = item.children.some((child) =>
              location.pathname.startsWith(
                child.path?.split("/").slice(0, 3).join("/") || ""
              )
            );
            const isOpen =
              item.text === "Settings"
                ? settingsOpen
                : item.text === "Credentials"
                ? credentialsOpen
                : false;
            const setOpen =
              item.text === "Settings"
                ? () => setSettingsOpen(!settingsOpen)
                : item.text === "Credentials"
                ? () => setCredentialsOpen(!credentialsOpen)
                : () => {};

            return (
              <Box key={item.text}>
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={setOpen}
                    selected={isActive}
                    sx={{
                      mx: 1,
                      borderRadius: 1,
                      "&.Mui-selected": {
                        backgroundColor: "primary.main",
                        color: "primary.contrastText",
                        "&:hover": {
                          backgroundColor: "primary.dark",
                        },
                        "& .MuiListItemIcon-root": {
                          color: "primary.contrastText",
                        },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 40,
                        color: isActive ? "inherit" : "text.secondary",
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.text} />
                    {isOpen ? <ExpandLess /> : <ExpandMore />}
                  </ListItemButton>
                </ListItem>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {item.children.map((child) => (
                      <ListItem
                        key={child.text}
                        disablePadding
                        sx={{ mb: 0.5 }}
                      >
                        <ListItemButton
                          selected={location.pathname === child.path}
                          onClick={() => navigate(child.path!)}
                          sx={{
                            mx: 1,
                            ml: 3,
                            borderRadius: 1,
                            "&.Mui-selected": {
                              backgroundColor: "primary.light",
                              color: "primary.contrastText",
                              "&:hover": {
                                backgroundColor: "primary.main",
                              },
                              "& .MuiListItemIcon-root": {
                                color: "primary.contrastText",
                              },
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 36,
                              color:
                                location.pathname === child.path
                                  ? "inherit"
                                  : "text.secondary",
                            }}
                          >
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={child.text}
                            primaryTypographyProps={{ variant: "body2" }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          }

          // Regular menu item
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path!)}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  "&.Mui-selected": {
                    backgroundColor: "primary.main",
                    color: "primary.contrastText",
                    "&:hover": {
                      backgroundColor: "primary.dark",
                    },
                    "& .MuiListItemIcon-root": {
                      color: "primary.contrastText",
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40,
                    color:
                      location.pathname === item.path
                        ? "inherit"
                        : "text.secondary",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Divider />
      <List sx={{ pb: 2 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={toggleOpen}
            sx={{
              mx: 1,
              borderRadius: 1,
              position: "relative",
              "&:hover": {
                backgroundColor: "action.hover",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Badge badgeContent={activeTransfers.length} color="primary">
                <TransferIcon />
              </Badge>
            </ListItemIcon>
            <ListItemText primary="Transfers" />
            {activeTransfers.length > 0 && (
              <LinearProgress
                variant="determinate"
                value={totalProgress}
                sx={{
                  position: "absolute",
                  bottom: 4,
                  left: 8,
                  right: 8,
                  height: 3,
                  borderRadius: 1,
                }}
              />
            )}
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              mx: 1,
              borderRadius: 1,
              color: "error.main",
              "&:hover": {
                backgroundColor: "error.main",
                color: "error.contrastText",
                "& .MuiListItemIcon-root": {
                  color: "error.contrastText",
                },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: "error.main" }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            {(() => {
              // Find the current page title
              for (const item of navItems) {
                if (item.path === location.pathname) return item.text;
                if (item.children) {
                  const child = item.children.find(
                    (c) => c.path === location.pathname
                  );
                  if (child) return `${item.text} - ${child.text}`;
                }
              }
              return "ByteServe";
            })()}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", sm: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", sm: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}
        <Outlet />
      </Box>

      {/* Transfer Manager Drawer */}
      <TransferManager />
    </Box>
  );
}
