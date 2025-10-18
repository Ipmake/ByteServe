import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  Alert,
  AlertTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  SelectChangeEvent,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ContentCopy as CopyIcon,
  Visibility,
  VisibilityOff,
  AppRegistration as S3Icon,
} from '@mui/icons-material';
import { apiService } from '../../../api.js';

interface Bucket {
  id: string;
  name: string;
}

export default function S3Page() {
  const [credentials, setCredentials] = useState<Credentials.S3.Credential[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [_, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<Credentials.S3.Credential | null>(null);
  const [selectedBuckets, setSelectedBuckets] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [credsData, bucketsData] = await Promise.all([
        apiService.getS3Credentials(),
        apiService.getBuckets(),
      ]);
      setCredentials(credsData);
      setBuckets(bucketsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpen = () => {
    setSelectedBuckets([]);
    setCreateDialogOpen(true);
  };

  const handleCreateClose = () => {
    setCreateDialogOpen(false);
    setSelectedBuckets([]);
  };

  const handleCreateSubmit = async () => {
    try {
      await apiService.createS3Credential(selectedBuckets);
      await fetchData();
      handleCreateClose();
    } catch (error) {
      console.error('Error creating credential:', error);
    }
  };

  const handleEditOpen = (credential: Credentials.S3.Credential) => {
    setSelectedCredential(credential);
    setSelectedBuckets(credential.bucketAccess.map(ba => ba.id));
    setEditDialogOpen(true);
  };

  const handleEditClose = () => {
    setEditDialogOpen(false);
    setSelectedCredential(null);
    setSelectedBuckets([]);
  };

  const handleEditSubmit = async () => {
    if (!selectedCredential) return;
    
    try {
      await apiService.updateS3Credential(selectedCredential.id, selectedBuckets);
      await fetchData();
      handleEditClose();
    } catch (error) {
      console.error('Error updating credential:', error);
    }
  };

  const handleDeleteOpen = (credential: Credentials.S3.Credential) => {
    setSelectedCredential(credential);
    setDeleteDialogOpen(true);
  };

  const handleDeleteClose = () => {
    setDeleteDialogOpen(false);
    setSelectedCredential(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCredential) return;

    try {
      await apiService.deleteS3Credential(selectedCredential.id);
      await fetchData();
      handleDeleteClose();
    } catch (error) {
      console.error('Error deleting credential:', error);
    }
  };

  const handleBucketChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setSelectedBuckets(typeof value === 'string' ? value.split(',') : value);
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const s3Url = `${window.location.host}/s3`;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          S3 Credentials
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateOpen}
        >
          New Credential
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <AlertTitle>Connection Information</AlertTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {s3Url}
          </Typography>
          <Tooltip title={copiedField === 'url' ? 'Copied!' : 'Copy URL'}>
            <IconButton size="small" onClick={() => copyToClipboard(s3Url, 'url')}>
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Use the credentials below to connect with any S3 client (e.g., AWS CLI, Cyberduck, Transmit).
        </Typography>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Access Key</TableCell>
              <TableCell>Secret Key</TableCell>
              <TableCell>Bucket Access</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <S3Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="body1" color="text.secondary">
                    No S3 credentials yet. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {cred.accessKey}
                      </Typography>
                      <Tooltip title={copiedField === `user-${cred.id}` ? 'Copied!' : 'Copy'}>
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(cred.accessKey, `user-${cred.id}`)}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {showPassword[cred.id] ? cred.secretKey : '•'.repeat(40)}
                      </Typography>
                      <Tooltip title={showPassword[cred.id] ? 'Hide' : 'Show'}>
                        <IconButton 
                          size="small" 
                          onClick={() => togglePasswordVisibility(cred.id)}
                        >
                          {showPassword[cred.id] ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={copiedField === `pass-${cred.id}` ? 'Copied!' : 'Copy'}>
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(cred.secretKey, `pass-${cred.id}`)}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {cred.bucketAccess.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No access
                        </Typography>
                      ) : (
                        cred.bucketAccess.map((ba) => (
                          <Chip
                            key={ba.id}
                            label={ba.name}
                            size="small"
                            variant="outlined"
                          />
                        ))
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(cred.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleEditOpen(cred)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteOpen(cred)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={handleCreateClose} maxWidth="sm" fullWidth>
        <DialogTitle>Create S3 Credential</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A new S3 credential pair will be generated automatically. Select which buckets this credential can access.
          </DialogContentText>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Bucket Access</InputLabel>
            <Select
              multiple
              value={selectedBuckets}
              onChange={handleBucketChange}
              input={<OutlinedInput label="Bucket Access" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const bucket = buckets.find(b => b.id === value);
                    return <Chip key={value} label={bucket?.name} size="small" />;
                  })}
                </Box>
              )}
            >
              {buckets.map((bucket) => (
                <MenuItem key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCreateClose}>Cancel</Button>
          <Button onClick={handleCreateSubmit} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditClose} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Bucket Access</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Update which buckets this credential can access. The username and password cannot be changed.
          </DialogContentText>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Bucket Access</InputLabel>
            <Select
              multiple
              value={selectedBuckets}
              onChange={handleBucketChange}
              input={<OutlinedInput label="Bucket Access" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const bucket = buckets.find(b => b.id === value);
                    return <Chip key={value} label={bucket?.name} size="small" />;
                  })}
                </Box>
              )}
            >
              {buckets.map((bucket) => (
                <MenuItem key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <Button onClick={handleEditSubmit} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteClose}>
        <DialogTitle>Delete Credential</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this S3 credential? This action cannot be undone and any connected clients will lose access.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
