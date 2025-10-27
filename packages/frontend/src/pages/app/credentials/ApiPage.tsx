import { useState, useEffect } from "react";
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
  Alert,
  AlertTitle,
  Tooltip,
  TextField,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  AppRegistration as ApiIcon,
} from "@mui/icons-material";
import { apiService } from "../../../api.js";
import moment from "moment";

export default function ApiPage() {
  const [credentials, setCredentials] = useState<Credentials.Api.Credential[]>(
    []
  );
  const [_, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createExpiresIn, setCreateExpiresIn] = useState(30);
  const [createDescription, setCreateDescription] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] =
    useState<Credentials.Api.Credential | null>(null);
  const [showPassword] = useState<{ [key: string]: boolean }>(
    {}
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [credsData] = await Promise.all([apiService.getApiCredentials()]);
      setCredentials(credsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpen = () => {
    setCreateDialogOpen(true);
    setCreateExpiresIn(30);
    setCreateDescription("");
  };

  const handleCreateClose = () => {
    setCreateDialogOpen(false);
    setCreateExpiresIn(30);
    setCreateDescription("");
  };

  const handleCreateSubmit = async () => {
    try {
      await apiService.createApiCredential(createExpiresIn, createDescription);
      await fetchData();
      handleCreateClose();
    } catch (error) {
      console.error("Error creating credential:", error);
    }
  };

  const handleDeleteOpen = (credential: Credentials.Api.Credential) => {
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
      await apiService.deleteApiCredential(selectedCredential.id);
      await fetchData();
      handleDeleteClose();
    } catch (error) {
      console.error("Error deleting credential:", error);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
    }
  };

  const ApiUrl = `${window.location.host}/api/`;

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Api Credentials
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            {ApiUrl}
          </Typography>
          <Tooltip title={copiedField === "url" ? "Copied!" : "Copy URL"}>
            <IconButton
              size="small"
              onClick={() => copyToClipboard(ApiUrl, "url")}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Use the credentials below to connect to the Api endpoint.
        </Typography>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Token</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                  <ApiIcon
                    sx={{ fontSize: 48, color: "text.disabled", mb: 2 }}
                  />
                  <Typography variant="body1" color="text.secondary">
                    No Api credentials yet. Create one to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace" }}
                      >
                        {cred.description}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace" }}
                      >
                        {showPassword[cred.id] ? cred.token : "•".repeat(16)}
                      </Typography>
                      <Tooltip
                        title={
                          copiedField === `pass-${cred.id}` ? "Copied!" : "Copy"
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() =>
                            copyToClipboard(cred.token, `pass-${cred.id}`)
                          }
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={moment(cred.expiresAt).format("LLLL")}>
                      <Typography variant="body2" sx={{ width: "fit-content" }}>
                        {moment(cred.expiresAt).fromNow()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={moment(cred.createdAt).format("LLLL")}>
                      <Typography variant="body2" sx={{ width: "fit-content" }}>
                        {moment(cred.createdAt).fromNow()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
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
      <Dialog
        open={createDialogOpen}
        onClose={handleCreateClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Api Credential</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A new Api credential pair will be generated automatically. Select
            which buckets this credential can access.
          </DialogContentText>

          <TextField
            label="Expiration (Days)"
            value={createExpiresIn}
            onChange={(e) => setCreateExpiresIn(Number(e.target.value))}
            type="number"
            inputProps={{ min: 1, max: 365 }}
            fullWidth
            sx={{ mb: 2 }}
          />

          <TextField
            label="Description"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            placeholder="e.g., Public Api Key"
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCreateClose}>Cancel</Button>
          <Button
            onClick={handleCreateSubmit}
            variant="contained"
            disabled={
              !createDescription.trim() ||
              createExpiresIn < 1 ||
              createExpiresIn > 365
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteClose}>
        <DialogTitle>Delete Credential</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this Api credential? This action
            cannot be undone and any connected clients will lose access.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteClose}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
