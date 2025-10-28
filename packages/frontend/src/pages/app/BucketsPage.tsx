import { useState, useEffect } from "react";
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FolderOpen as FolderOpenIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  LockOpen as LockOpenIcon,
  Checklist,
} from "@mui/icons-material";
import { apiService } from "../../api";
import { useNavigate } from "react-router-dom";
import QuotaInput from "../../components/QuotaInput";
import {
  formatBytes,
  calculateQuotaPercentage,
  getQuotaColor,
} from "../../utils/format";
import BucketConfigDrawer from "../../components/BucketConfigDrawer";
import AbsoluteDateDisplay from "../../components/AbsoulteDateDisplay";
import RelativeDateDisplay from "../../components/RelativeDateDisplay";

export default function BucketsPage() {
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState<Models.BucketPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [bucketName, setBucketName] = useState("");
  const [bucketAccess, setBucketAccess] = useState<
    "private" | "public-read" | "public-write"
  >("private");
  const [bucketQuota, setBucketQuota] = useState<number>(-1); // -1 for unlimited
  const [editingBucket, setEditingBucket] =
    useState<Models.BucketPublic | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] =
    useState<Models.BucketPublic | null>(null);
  const [nameCheckLoading, setNameCheckLoading] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameCheckError, setNameCheckError] = useState<string | null>(null);

  const [bucketConfigOpen, setBucketConfigOpen] = useState<string | null>(null); // bucket ID or null

  useEffect(() => {
    fetchBuckets();
  }, []);

  const fetchBuckets = async () => {
    setLoading(true);
    setError(null);
    setBucketConfigOpen(null);
    try {
      const data = await apiService.getBuckets();
      setBuckets(data);
    } catch (err: any) {
      setError(
        err.response?.data?.error || err.message || "Failed to fetch buckets"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setBucketName("");
    setBucketAccess("private");
    setBucketQuota(-1);
    setEditingBucket(null);
    setNameAvailable(null);
    setNameCheckError(null);
    setOpenDialog(true);
  };

  const handleOpenEdit = (bucket: Models.BucketPublic, e: React.MouseEvent) => {
    e.stopPropagation();
    setBucketName(bucket.name);
    setBucketAccess(bucket.access);
    setBucketQuota(bucket.storageQuota || -1);
    setEditingBucket(bucket);
    setNameAvailable(null);
    setNameCheckError(null);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setBucketName("");
    setBucketAccess("private");
    setBucketQuota(-1);
    setEditingBucket(null);
    setNameAvailable(null);
    setNameCheckError(null);
  };

  // Debounced check for bucket name availability
  useEffect(() => {
    if (!bucketName || bucketName.length < 1) {
      setNameAvailable(null);
      setNameCheckError(null);
      return;
    }

    // Skip check if editing and name hasn't changed
    if (editingBucket && bucketName.toLowerCase() === editingBucket.name) {
      setNameAvailable(null);
      setNameCheckError(null);
      return;
    }

    // Validate format first
    if (!/^[a-z0-9-]+$/.test(bucketName.toLowerCase())) {
      setNameAvailable(false);
      setNameCheckError("Only lowercase letters, numbers, and hyphens allowed");
      return;
    }

    setNameCheckLoading(true);
    const timeoutId = setTimeout(async () => {
      try {
        const data = await apiService.checkBucketName(bucketName.toLowerCase());
        setNameAvailable(data.available);
        setNameCheckError(data.reason || null);
      } catch (err) {
        console.error("Error checking bucket name:", err);
      } finally {
        setNameCheckLoading(false);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timeoutId);
      setNameCheckLoading(false);
    };
  }, [bucketName, editingBucket]);

  const handleSubmit = async () => {
    if (!bucketName.trim()) {
      setError("Bucket name is required");
      return;
    }

    // Validate bucket name format
    if (!/^[a-z0-9-]+$/.test(bucketName.toLowerCase())) {
      setError(
        "Bucket name must contain only lowercase letters, numbers, and hyphens"
      );
      return;
    }

    try {
      if (editingBucket) {
        // Update existing bucket
        const updates: {
          name?: string;
          access?: "private" | "public-read" | "public-write";
          storageQuota?: number;
        } = {};
        if (bucketName.toLowerCase() !== editingBucket.name) {
          updates.name = bucketName.toLowerCase();
        }
        if (bucketAccess !== editingBucket.access) {
          updates.access = bucketAccess;
        }
        if (bucketQuota !== editingBucket.storageQuota) {
          updates.storageQuota = bucketQuota;
        }
        if (Object.keys(updates).length > 0) {
          await apiService.updateBucket(editingBucket.id, updates);
        }
      } else {
        // Create new bucket
        await apiService.createBucket(
          bucketName.toLowerCase(),
          bucketAccess,
          bucketQuota
        );
      }

      handleCloseDialog();
      fetchBuckets();
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.message ||
          `Failed to ${editingBucket ? "update" : "create"} bucket`
      );
    }
  };

  const getAccessIcon = (access: string) => {
    switch (access) {
      case "private":
        return <LockIcon fontSize="small" />;
      case "public-read":
        return <PublicIcon fontSize="small" />;
      case "public-write":
        return <LockOpenIcon fontSize="small" />;
      default:
        return <LockIcon fontSize="small" />;
    }
  };

  const getAccessLabel = (access: string) => {
    switch (access) {
      case "private":
        return "Private";
      case "public-read":
        return "Public Read";
      case "public-write":
        return "Public Write";
      default:
        return access;
    }
  };

  const handleDeleteClick = (bucket: Models.BucketPublic) => {
    setBucketToDelete(bucket);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!bucketToDelete) return;

    try {
      await apiService.deleteBucket(bucketToDelete.id);
      setDeleteConfirmOpen(false);
      setBucketToDelete(null);
      fetchBuckets();
    } catch (err: any) {
      setError(
        err.response?.data?.error || err.message || "Failed to delete bucket"
      );
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4">Buckets</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Create Bucket
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : buckets.length === 0 ? (
        <Paper sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            No buckets yet
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Create your first bucket to start organizing your files
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
          >
            Create Bucket
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Access</TableCell>
                <TableCell>Objects</TableCell>
                <TableCell>Storage Usage</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Modified</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {buckets.map((bucket) => (
                <TableRow
                  key={bucket.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() =>
                    navigate(`/app/buckets/${bucket.id}`, {
                      state: { bucketName: bucket.name },
                    })
                  }
                >
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <FolderOpenIcon color="primary" />
                      <Typography variant="body1" fontWeight={500}>
                        {bucket.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getAccessIcon(bucket.access)}
                      label={getAccessLabel(bucket.access)}
                      size="small"
                      color={
                        bucket.access === "private" ? "default" : "success"
                      }
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={
                        bucket.objectCount === 0
                          ? "Empty"
                          : `${bucket.objectCount} object${
                              bucket.objectCount !== 1 ? "s" : ""
                            }`
                      }
                      size="small"
                      variant="outlined"
                      color={bucket.objectCount > 0 ? "primary" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ minWidth: 120 }}>
                      {bucket.storageQuota === -1 ? (
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {formatBytes(bucket.usedStorage || 0)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Unlimited
                          </Typography>
                        </Box>
                      ) : (
                        <Box>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mb: 0.5,
                            }}
                          >
                            <Typography variant="body2" fontWeight={500}>
                              {formatBytes(bucket.usedStorage || 0)}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              / {formatBytes(bucket.storageQuota)}
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={calculateQuotaPercentage(
                              bucket.usedStorage || 0,
                              bucket.storageQuota
                            )}
                            color={getQuotaColor(
                              calculateQuotaPercentage(
                                bucket.usedStorage || 0,
                                bucket.storageQuota
                              )
                            )}
                            sx={{ height: 6, borderRadius: 1 }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {calculateQuotaPercentage(
                              bucket.usedStorage || 0,
                              bucket.storageQuota
                            )}
                            % used
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <AbsoluteDateDisplay date={bucket.createdAt} />
                  </TableCell>
                  <TableCell>
                    <RelativeDateDisplay date={bucket.updatedAt} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        setBucketConfigOpen(bucket.id)
                      }}
                      title="Edit bucket config"
                    >
                      <Checklist />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenEdit(bucket, e)}
                      title="Edit bucket"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(bucket);
                      }}
                      title="Delete bucket"
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
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingBucket ? "Edit Bucket" : "Create New Bucket"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Bucket Name"
            type="text"
            fullWidth
            variant="outlined"
            value={bucketName}
            onChange={(e) => {
              let value = e.target.value.toLowerCase();

              value = value.replaceAll(" ", "-").slice(0, 64); // Limit length to 64 characters

              setBucketName(value);
            }}
            error={nameAvailable === false}
            helperText={
              nameCheckLoading
                ? "Checking availability..."
                : nameAvailable === false
                ? nameCheckError || "This bucket name is not available"
                : nameAvailable === true
                ? "✓ This name is available"
                : "Lowercase letters, numbers, and hyphens only"
            }
            sx={{ mt: 2 }}
            InputProps={{
              endAdornment: nameCheckLoading ? (
                <CircularProgress size={20} />
              ) : undefined,
            }}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Access Control</InputLabel>
            <Select
              value={bucketAccess}
              label="Access Control"
              onChange={(e) =>
                setBucketAccess(
                  e.target.value as "private" | "public-read" | "public-write"
                )
              }
            >
              <MenuItem value="private">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LockIcon fontSize="small" />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Private
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Only you can access
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
              <MenuItem value="public-read">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PublicIcon fontSize="small" />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Public Read
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Anyone can view files
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
              <MenuItem value="public-write">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LockOpenIcon fontSize="small" />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Public Write
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Anyone can upload/modify
                    </Typography>
                  </Box>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ mt: 3 }}>
            <QuotaInput
              value={bucketQuota}
              onChange={setBucketQuota}
              label="Storage Quota"
              helperText="Maximum storage allowed for this bucket"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={
              !bucketName.trim() ||
              nameCheckLoading ||
              (nameAvailable === false &&
                (!editingBucket ||
                  bucketName.toLowerCase() !== editingBucket.name))
            }
          >
            {editingBucket ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>Delete Bucket?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the bucket{" "}
            <strong>"{bucketToDelete?.name}"</strong>?
            <br />
            This action cannot be undone and will delete all objects in the
            bucket.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <BucketConfigDrawer
        bucketId={bucketConfigOpen}
        onClose={() => {
          setBucketConfigOpen(null);
        }}
      />
    </Box>
  );
}
