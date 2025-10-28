import React, { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
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
  Breadcrumbs,
  Link,
  Chip,
  Tooltip,
  Menu,
  MenuItem,
  Tabs,
  Tab,
} from "@mui/material";
import {
  CreateNewFolder as CreateFolderIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  InsertDriveFile,
  Download as DownloadIcon,
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
  Edit as EditIcon,
  Share as ShareIcon,
  ChevronLeft,
} from "@mui/icons-material";
import { apiService } from "../../api";
import { useTransferStore } from "../../store/transferStore";
import { TableVirtuoso } from "react-virtuoso";
import { useAuthStore } from "../../states/authStore";
import FileReqModal from "../../components/FileReqModal";
import RelativeDateDisplay from "../../components/RelativeDateDisplay";

export default function FileBrowserPage() {
  const { bucketId } = useParams<{ bucketId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { addTransfer, updateTransfer } = useTransferStore();

  const bucketName = location.state?.bucketName || "Bucket";

  const [bucket, setBucket] = useState<Models.BucketPublic | null>(null);
  const [objects, setObjects] = useState<Models.ObjectPublic[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    undefined
  );
  const [breadcrumbStack, setBreadcrumbStack] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");

  const [uploadFileOpen, setUploadFileOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [objectToDelete, setObjectToDelete] =
    useState<Models.ObjectPublic | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [objectToRename, setObjectToRename] =
    useState<Models.ObjectPublic | null>(null);
  const [newFilename, setNewFilename] = useState("");

  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const [createFileReqDialogOpen, setCreateFileReqDialogOpen] = useState(false);
  const [fileReqId, setFileReqId] = useState<string | null>(null);
  const [fileReqPlatform, setFileReqPlatform] = useState<string>("linux");

  const [uploadMenuAnchorEl, setUploadMenuAnchorEl] =
    useState<null | HTMLElement>(null);

  useEffect(() => {
    if (bucketId) {
      fetchBucket();
      fetchObjects();
    }
  }, [bucketId, currentFolderId]);

  const fetchBucket = async () => {
    if (!bucketId) return;

    try {
      const data = await apiService.getBucket(bucketId);
      setBucket(data);
    } catch (err: any) {
      console.error("Failed to fetch bucket:", err);
    }
  };

  const fetchObjects = async () => {
    if (!bucketId) return;

    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getObjects(bucketId, currentFolderId);
      setObjects(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch objects");
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToFolder = (folder: Models.ObjectPublic) => {
    setBreadcrumbStack([
      ...breadcrumbStack,
      { id: folder.id, name: folder.filename },
    ]);
    setCurrentFolderId(folder.id);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Root
      setBreadcrumbStack([]);
      setCurrentFolderId(undefined);
    } else {
      // Navigate to specific breadcrumb
      const newStack = breadcrumbStack.slice(0, index + 1);
      setBreadcrumbStack(newStack);
      setCurrentFolderId(newStack[newStack.length - 1].id);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !bucketId) {
      setError("Folder name is required");
      return;
    }

    try {
      await apiService.createFolder(bucketId, folderName, currentFolderId);
      setCreateFolderOpen(false);
      setFolderName("");
      fetchObjects();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create folder");
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
      setUploadFileOpen(true);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFiles.length || !bucketId) return;

    setUploadFileOpen(false);
    const filesToUpload = selectedFiles;
    setSelectedFiles([]);

    // Flip the order so the first file is at the bottom, last file is at the top
    const reversedFiles = [...filesToUpload].reverse();
    let allSucceeded = true;
    for (const file of reversedFiles) {
      const transferId = addTransfer({
        type: "upload",
        filename: file.name,
        size: file.size,
        progress: 0,
        status: "active",
      });

      try {
        const token = localStorage.getItem("authToken");
        if (!token) {
          updateTransfer(transferId, {
            status: "error",
            error: "Not authenticated",
          });
          setError("Not authenticated");
          allSucceeded = false;
          continue;
        }

        // Create XMLHttpRequest to track progress
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucketId", bucketId);
        if (currentFolderId) {
          formData.append("parentId", currentFolderId);
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = (e.loaded / e.total) * 100;
              updateTransfer(transferId, { progress });
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              updateTransfer(transferId, {
                progress: 100,
                status: "completed",
              });
              resolve();
            } else {
              let errorMessage = "Upload failed";
              try {
                const response = JSON.parse(xhr.responseText);
                if (response.error) {
                  errorMessage = response.error;
                }
              } catch (e) {
                // If response is not JSON, use status text or default message
                errorMessage = xhr.statusText || "Upload failed";
              }
              reject(new Error(errorMessage));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error"));
          });

          xhr.open("POST", "/api/objects/upload");
          xhr.setRequestHeader("Authorization", token);
          xhr.send(formData);
        });
      } catch (err: any) {
        updateTransfer(transferId, {
          status: "error",
          error: err.message || "Failed to upload file",
        });
        setError(err.message || "Failed to upload file");
        allSucceeded = false;
      }
    }
    // Only refresh file list after all uploads are finished
    if (allSucceeded) {
      fetchObjects();
    }
  };

  const handleDeleteClick = (object: Models.ObjectPublic) => {
    setObjectToDelete(object);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!objectToDelete) return;

    try {
      await apiService.deleteObject(objectToDelete.id);
      setDeleteConfirmOpen(false);
      setObjectToDelete(null);
      fetchObjects();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete object");
      setDeleteConfirmOpen(false);
    }
  };

  const handleDownload = async (object: Models.ObjectPublic) => {
    if (object.isFolder) return;

    const transferId = addTransfer({
      type: "download",
      filename: object.filename,
      size: object.size,
      progress: 0,
      status: "active",
    });

    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        updateTransfer(transferId, {
          status: "error",
          error: "Not authenticated",
        });
        setError("Not authenticated");
        return;
      }

      // Use XMLHttpRequest to track progress
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            updateTransfer(transferId, { progress });
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateTransfer(transferId, { progress: 100, status: "completed" });
            resolve(xhr.response);
          } else {
            reject(new Error("Download failed"));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error"));
        });

        xhr.open(
          "GET",
          `/api/objects/${object.id}/download`
        );
        xhr.setRequestHeader("Authorization", token);
        xhr.responseType = "blob";
        xhr.send();
      });

      // Create a download link and trigger it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = object.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      updateTransfer(transferId, {
        status: "error",
        error: err.message || "Failed to download file",
      });
      setError(err.message || "Failed to download file");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const isImageFile = (mimeType: string) => {
    return mimeType.startsWith("image/");
  };

  const isTextFile = (mimeType: string) => {
    const textTypes = [
      "text/",
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-javascript", // Older/non-standard JS mimetype
      "application/typescript",
    ];
    return (
      textTypes.some((type) => mimeType.startsWith(type)) ||
      mimeType.includes("text") ||
      /\.(txt|md|json|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|sh|yaml|yml)$/i.test(
        mimeType
      )
    );
  };

  const isVideoFile = (mimeType: string) => {
    return mimeType.startsWith("video/");
  };

  const isViewableFile = (object: Models.ObjectPublic) => {
    if (object.isFolder) return false;
    return (
      isImageFile(object.mimeType) ||
      isTextFile(object.mimeType) ||
      isVideoFile(object.mimeType)
    );
  };

  const handleShareClick = (
    object: Models.ObjectPublic,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (!bucket) return;

    // Build path from breadcrumbs
    const pathParts = breadcrumbStack.map((b) => b.name);
    pathParts.push(object.filename);
    const path = pathParts.join("/");

    const url = `${window.location.origin}/api/storage/${bucket.name}/${path}`;
    setShareUrl(url);
    setShareDialogOpen(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        // Show success feedback
        setShareDialogOpen(false);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  };

  const handleFileClick = async (object: Models.ObjectPublic) => {
    if (object.isFolder) {
      handleNavigateToFolder(object);
      return;
    }

    if (!isViewableFile(object)) return;

    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      // Open in new window with specific URL outside normal routing
      const baseUrl = window.location.origin;

      if (isImageFile(object.mimeType)) {
        window.open(
          `${baseUrl}/viewer/image/${object.id}?token=${token}`,
          "_blank",
          "width=1200,height=800"
        );
      } else if (isTextFile(object.mimeType)) {
        window.open(
          `${baseUrl}/viewer/text/${object.id}?token=${token}`,
          "_blank",
          "width=1400,height=900"
        );
      } else if (isVideoFile(object.mimeType)) {
        window.open(
          `${baseUrl}/viewer/video/${object.id}?token=${token}`,
          "_blank",
          "width=1200,height=800"
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to open file");
    }
  };

  const handleRenameClick = (object: Models.ObjectPublic) => {
    setObjectToRename(object);
    setNewFilename(object.filename);
    setRenameDialogOpen(true);
  };

  const handleRenameConfirm = async () => {
    if (!objectToRename || !newFilename.trim() || !bucketId) return;

    try {
      await apiService.renameObject(objectToRename.id, newFilename);
      setRenameDialogOpen(false);
      setObjectToRename(null);
      setNewFilename("");
      fetchObjects();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to rename object");
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !bucketId) {
      setError("Filename is required");
      return;
    }

    try {
      const token = useAuthStore.getState().user?.token;
      // Create empty file
      const createdFile = await apiService.createFile(
        bucketId,
        newFileName,
        currentFolderId
      );
      setCreateFileOpen(false);
      setNewFileName("");

      // Open the file in text editor
      const baseUrl = window.location.origin;
      window.open(
        `${baseUrl}/viewer/text/${createdFile.id}?token=${token}`,
        "_blank",
        "width=1400,height=900"
      );

      fetchObjects();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create file");
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton
            onClick={() => navigate("/app/buckets")}
            title="Back to buckets"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{bucketName}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<CreateFolderIcon />}
            onClick={() => setCreateFolderOpen(true)}
          >
            New Folder
          </Button>
          <Button
            variant="outlined"
            startIcon={<InsertDriveFile />}
            onClick={() => setCreateFileOpen(true)}
          >
            New File
          </Button>
          <Box sx={{ display: "flex" }}>
            <Button
              variant="contained"
              component="label"
              startIcon={<UploadIcon />}
              sx={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              Upload File(s)
              <input type="file" hidden multiple onChange={handleFileSelect} />
            </Button>
            <Button
              variant="contained"
              sx={{
                minWidth: 40,
                px: 1,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: "1px solid rgba(0,0,0,0.12)",
              }}
              aria-controls="upload-menu"
              aria-haspopup="true"
              onClick={(e) => setUploadMenuAnchorEl(e.currentTarget)}
            >
              <ChevronLeft
                sx={{
                  transform: "rotate(-90deg)",
                }}
              />
            </Button>
            {/* Dropdown Menu */}
            <Menu
              id="upload-menu"
              anchorEl={uploadMenuAnchorEl}
              open={Boolean(uploadMenuAnchorEl)}
              onClose={() => setUploadMenuAnchorEl(null)}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "right",
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
            >
              <MenuItem
                onClick={() => {
                  setUploadMenuAnchorEl(null);
                  setCreateFileReqDialogOpen(true);
                }}
              >
                Create File Request
              </MenuItem>
            </Menu>
          </Box>
        </Box>
      </Box>

      {/* Breadcrumbs */}
      <Box sx={{ mb: 2 }}>
        <Breadcrumbs>
          <Link
            component="button"
            variant="body1"
            onClick={() => handleBreadcrumbClick(-1)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              cursor: "pointer",
            }}
          >
            <HomeIcon fontSize="small" />
            Root
          </Link>
          {breadcrumbStack.map((crumb, index) => (
            <Link
              key={crumb.id}
              component="button"
              variant="body1"
              onClick={() => handleBreadcrumbClick(index)}
              sx={{ cursor: "pointer" }}
            >
              {crumb.name}
            </Link>
          ))}
        </Breadcrumbs>
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
      ) : objects.length === 0 ? (
        <Paper sx={{ py: 8, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            This folder is empty
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Upload files or create folders to get started
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ height: "calc(100vh - 280px)", width: "100%" }}>
          <TableVirtuoso
            data={objects}
            components={{
              Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
                <TableContainer component={Paper} {...props} ref={ref} />
              )),
              Table: (props) => (
                <Table
                  {...props}
                  sx={{ borderCollapse: "separate", tableLayout: "fixed" }}
                />
              ),
              TableHead: React.forwardRef<HTMLTableSectionElement>(
                (props, ref) => <TableHead {...props} ref={ref} />
              ),
              TableRow: ({ item: _item, ...props }) => (
                <TableRow {...props} hover />
              ),
              TableBody: React.forwardRef<HTMLTableSectionElement>(
                (props, ref) => <TableBody {...props} ref={ref} />
              ),
            }}
            fixedHeaderContent={() => (
              <TableRow>
                <TableCell
                  sx={{ width: "30%", backgroundColor: "background.paper" }}
                >
                  Name
                </TableCell>
                <TableCell
                  sx={{ width: "20%", backgroundColor: "background.paper" }}
                >
                  Type
                </TableCell>
                <TableCell
                  sx={{ width: "15%", backgroundColor: "background.paper" }}
                >
                  Size
                </TableCell>
                <TableCell
                  sx={{ width: "15%", backgroundColor: "background.paper" }}
                >
                  Modified
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ width: "10%", backgroundColor: "background.paper" }}
                >
                  Actions
                </TableCell>
              </TableRow>
            )}
            itemContent={(_index, object) => (
              <>
                <TableCell
                  onClick={() => handleFileClick(object)}
                  sx={{
                    cursor:
                      object.isFolder || isViewableFile(object)
                        ? "pointer"
                        : "default",
                  }}
                >
                  <Tooltip title={object.filename} arrow placement="top">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        maxWidth: 300,
                      }}
                    >
                      {object.isFolder ? (
                        <FolderIcon color="primary" sx={{ flexShrink: 0 }} />
                      ) : (
                        <FileIcon color="action" sx={{ flexShrink: 0 }} />
                      )}
                      <Typography
                        variant="body1"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {object.filename}
                      </Typography>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell
                  onClick={() => handleFileClick(object)}
                  sx={{
                    cursor:
                      object.isFolder || isViewableFile(object)
                        ? "pointer"
                        : "default",
                  }}
                >
                  <Chip
                    label={object.isFolder ? "Folder" : object.mimeType}
                    size="small"
                    variant="outlined"
                    color={object.isFolder ? "primary" : "default"}
                  />
                </TableCell>
                <TableCell
                  onClick={() => handleFileClick(object)}
                  sx={{
                    cursor:
                      object.isFolder || isViewableFile(object)
                        ? "pointer"
                        : "default",
                  }}
                >
                  {object.isFolder ? "-" : formatFileSize(object.size)}
                </TableCell>
                <TableCell
                  onClick={() => handleFileClick(object)}
                  sx={{
                    cursor:
                      object.isFolder || isViewableFile(object)
                        ? "pointer"
                        : "default",
                  }}
                >
                  <RelativeDateDisplay date={object.updatedAt} />
                </TableCell>
                <TableCell align="right">
                  <Box
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      justifyContent: "flex-end",
                    }}
                  >
                    {!object.isFolder &&
                      bucket &&
                      (bucket.access === "public-read" ||
                        bucket.access === "public-write") && (
                        <IconButton
                          size="small"
                          onClick={(e) => handleShareClick(object, e)}
                          title="Copy share link"
                        >
                          <ShareIcon />
                        </IconButton>
                      )}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameClick(object);
                      }}
                      title="Rename"
                    >
                      <EditIcon />
                    </IconButton>
                    {!object.isFolder && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(object);
                        }}
                        title="Download"
                      >
                        <DownloadIcon />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(object);
                      }}
                      title="Delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </TableCell>
              </>
            )}
          />
        </Paper>
      )}

      {/* Create Folder Dialog */}
      <Dialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            type="text"
            fullWidth
            variant="outlined"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create File Dialog */}
      <Dialog
        open={createFileOpen}
        onClose={() => setCreateFileOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New File</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="File Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="example.txt"
            helperText="Include the file extension (e.g., .txt, .js, .py)"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFileOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFile} variant="contained">
            Create & Edit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload File Dialog */}
      <Dialog
        open={uploadFileOpen}
        onClose={() => setUploadFileOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Upload File(s)</DialogTitle>
        <DialogContent>
          {selectedFiles.length === 0 ? (
            <Typography variant="body2" sx={{ mt: 2 }}>
              No files selected.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ mt: 2 }}>
                Selected files:
              </Typography>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {selectedFiles.map((file) => (
                  <li
                    key={file.name}
                    style={{
                      maxWidth: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                  >
                    <strong
                      style={{
                        maxWidth: 400,
                        display: "inline-block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        verticalAlign: "bottom",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </strong>{" "}
                    ({formatFileSize(file.size)})
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setUploadFileOpen(false);
              setSelectedFiles([]);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUploadFile}
            variant="contained"
            disabled={selectedFiles.length === 0}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Rename {objectToRename?.isFolder ? "Folder" : "File"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newFilename}
            onChange={(e) => setNewFilename(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRenameConfirm} variant="contained">
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>
          Delete {objectToDelete?.isFolder ? "Folder" : "File"}?
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete{" "}
            <strong>"{objectToDelete?.filename}"</strong>?
            {objectToDelete?.isFolder && (
              <>
                <br />
                This will also delete all contents inside this folder.
              </>
            )}
            <br />
            This action cannot be undone.
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

      {/* Share Link Dialog */}
      <Dialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Share File</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Anyone with this link can access this file:
          </Typography>
          <TextField
            fullWidth
            variant="outlined"
            value={shareUrl}
            InputProps={{
              readOnly: true,
            }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialogOpen(false)}>Close</Button>
          <Button onClick={handleCopyLink} variant="contained">
            Copy Link
          </Button>
        </DialogActions>
      </Dialog>

      {/* File Request Dialog */}
      <FileReqModal
        open={createFileReqDialogOpen}
        onClose={(fileReqId) => {
          setCreateFileReqDialogOpen(false);
          if (fileReqId) {
            setFileReqId(fileReqId);
          }
        }}
        bucketId={bucketId!}
        parentId={currentFolderId || null}
      />

      <Dialog
        open={Boolean(fileReqId)}
        onClose={() => setFileReqId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Upload File using FileRequest</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use this command to upload files via FileRequest:
          </Typography>

          <Typography variant="body2" color="error.main" sx={{ mb: 2 }}>
            If you enabled require api key, make sure to append "--api-key
            YOUR_API_KEY" to the command. <br />
            The file request will expire in 30 minutes after creation. <br />
            Replace "myfile.png" with your actual file name when uploading. If
            you specified a different filename when creating the file request,
            the final uploaded file will use that name instead. Otherwise it
            will use the name you provide with the --file argument.
          </Typography>

          <Tabs value={fileReqPlatform === "linux" ? 0 : 1}>
            <Tab
              label="Linux / macOS"
              onClick={() => setFileReqPlatform("linux")}
            />
            <Tab
              label="Windows"
              onClick={() => setFileReqPlatform("windows")}
            />
          </Tabs>

          <TextField
            fullWidth
            variant="outlined"
            value={
              fileReqId &&
              (fileReqPlatform === "linux"
                ? `curl ${document.location.protocol}//${document.location.host}/api/filereq/${fileReqId}/sh | bash -s -- --file myfile.png`
                : `& ([scriptblock]::Create((iwr -useb ${document.location.protocol}//${document.location.host}/api/filereq/${fileReqId}/ps1))) -File "myfile.txt"`)
            }
            slotProps={{
              input: {
                readOnly: true,
              },
            }}
            multiline={true}
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFileReqId(null)}>Close</Button>
          <Button
            onClick={() => {
              if (fileReqId) {
                navigator.clipboard
                  .writeText(
                    fileReqId &&
                      (fileReqPlatform === "linux"
                        ? `curl ${document.location.protocol}//${document.location.host}/api/filereq/${fileReqId}/sh | bash -s -- --file myfile.png`
                        : `& ([scriptblock]::Create((iwr -useb ${document.location.protocol}//${document.location.host}/api/filereq/${fileReqId}/ps1))) -File "myfile.txt"`)
                  )
                  .catch((err) => {
                    console.error("Failed to copy:", err);
                  });
              }
            }}
            variant="contained"
          >
            Copy Command
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
