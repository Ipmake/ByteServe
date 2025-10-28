import { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import QuotaInput from '../../components/QuotaInput';
import { SHA256 } from 'crypto-js';
import { formatBytes } from '../../utils/format';
import { apiService } from '../../api';
import AbsoluteDateDisplay from '../../components/AbsoulteDateDisplay';

interface User {
  id: string;
  username: string;
  enabled: boolean;
  isAdmin: boolean;
  storageQuota: number; // -1 for unlimited
  createdAt: string;
  updatedAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [storageQuota, setStorageQuota] = useState<number>(-1);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setIsAdmin(false);
    setEnabled(true);
    setStorageQuota(-1);
    setOpenDialog(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword('');
    setIsAdmin(user.isAdmin);
    setEnabled(user.enabled);
    setStorageQuota(user.storageQuota ?? -1);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setIsAdmin(false);
    setEnabled(true);
    setStorageQuota(-1);
  };

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (!editingUser && !password) {
      setError('Password is required for new users');
      return;
    }

    try {
      const userData: any = {
        username,
        isAdmin,
        enabled,
        storageQuota,
      };
      
      if (password) {
        userData.password = SHA256(`byteserve${password}byteserve`).toString();
      }

      if (editingUser) {
        await apiService.updateUser(editingUser.id, userData);
      } else {
        await apiService.createUser(userData);
      }

      handleCloseDialog();
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to save user');
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      await apiService.deleteUser(userToDelete.id);
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to delete user');
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">User Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Create User
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Storage Quota</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {user.isAdmin && <AdminIcon color="primary" fontSize="small" />}
                      <Typography variant="body1" fontWeight={user.isAdmin ? 600 : 400}>
                        {user.username}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isAdmin ? 'Admin' : 'User'}
                      size="small"
                      color={user.isAdmin ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.enabled ? 'Enabled' : 'Disabled'}
                      size="small"
                      color={user.enabled ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {formatBytes(user.storageQuota)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <AbsoluteDateDisplay date={user.createdAt} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenEdit(user)}
                      title="Edit user"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(user)}
                      title="Delete user"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Username"
            type="text"
            fullWidth
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            margin="dense"
            label={editingUser ? 'New Password (leave empty to keep current)' : 'Password'}
            type="password"
            fullWidth
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mt: 2 }}
          />
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
              }
              label="Enabled"
            />
          </Box>
          <Box sx={{ mt: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
              }
              label="Administrator"
            />
          </Box>
          <Box sx={{ mt: 3 }}>
            <QuotaInput
              value={storageQuota}
              onChange={setStorageQuota}
              label="Storage Quota"
              helperText="Maximum storage allowed for this user across all buckets"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete User?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete user <strong>"{userToDelete?.username}"</strong>?
            <br />
            This action cannot be undone and will delete all their buckets and files.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
