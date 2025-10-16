import {
  Box,
  Drawer,
  Typography,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  Chip,
  Button,
  Collapse,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  FileDownload as DownloadIcon,
  FileUpload as UploadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { useTransferStore } from '../store/transferStore';
import { useState } from 'react';

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatFileSize(bytesPerSecond)}/s`;
};

const formatTimeRemaining = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
};

export default function TransferManager() {
  const { transfers, isOpen, setOpen, removeTransfer, clearCompleted } = useTransferStore();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const activeTransfers = transfers.filter((t) => t.status === 'active' || t.status === 'pending');
  const completedTransfers = transfers.filter((t) => t.status === 'completed');
  const failedTransfers = transfers.filter((t) => t.status === 'error');

  const totalProgress = activeTransfers.length > 0
    ? activeTransfers.reduce((sum, t) => sum + t.progress, 0) / activeTransfers.length
    : 0;

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const calculateSpeed = (transfer: any) => {
    if (transfer.status !== 'active' || transfer.progress === 0) return 0;
    const elapsed = (Date.now() - transfer.startTime) / 1000;
    const bytesTransferred = (transfer.size * transfer.progress) / 100;
    return bytesTransferred / elapsed;
  };

  const calculateTimeRemaining = (transfer: any) => {
    if (transfer.status !== 'active' || transfer.progress === 0) return Infinity;
    const speed = calculateSpeed(transfer);
    if (speed === 0) return Infinity;
    const bytesRemaining = transfer.size - (transfer.size * transfer.progress) / 100;
    return bytesRemaining / speed;
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={() => setOpen(false)}
      sx={{
        width: 450,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 450,
          boxSizing: 'border-box',
          bgcolor: 'background.default',
          borderLeft: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Transfers
          </Typography>
          <IconButton onClick={() => setOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Overall Progress */}
        {activeTransfers.length > 0 && (
          <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {activeTransfers.length} active transfer{activeTransfers.length !== 1 ? 's' : ''}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {totalProgress.toFixed(0)}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={totalProgress} sx={{ height: 6, borderRadius: 1 }} />
          </Box>
        )}

        {/* Transfer List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {transfers.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                p: 3,
                textAlign: 'center',
              }}
            >
              <Typography variant="body1" color="text.secondary" gutterBottom>
                No active transfers
              </Typography>
              <Typography variant="body2" color="text.disabled">
                Upload or download files to see them here
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {transfers.map((transfer) => {
                const isExpanded = expandedItems.has(transfer.id);
                const speed = calculateSpeed(transfer);
                const timeRemaining = calculateTimeRemaining(transfer);

                return (
                  <Box key={transfer.id}>
                    <ListItem
                      sx={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        py: 1.5,
                        px: 2,
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      {/* Main Info */}
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
                        {/* Icon */}
                        <Box
                          sx={{
                            mt: 0.5,
                            color:
                              transfer.status === 'completed'
                                ? 'success.main'
                                : transfer.status === 'error'
                                ? 'error.main'
                                : 'primary.main',
                          }}
                        >
                          {transfer.type === 'upload' ? (
                            <UploadIcon fontSize="small" />
                          ) : (
                            <DownloadIcon fontSize="small" />
                          )}
                        </Box>

                        {/* File Info */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {transfer.filename}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatFileSize(transfer.size)}
                          </Typography>
                        </Box>

                        {/* Status */}
                        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                          {transfer.status === 'completed' && (
                            <CheckIcon fontSize="small" color="success" />
                          )}
                          {transfer.status === 'error' && (
                            <ErrorIcon fontSize="small" color="error" />
                          )}
                          <IconButton
                            size="small"
                            onClick={() => toggleExpanded(transfer.id)}
                          >
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => removeTransfer(transfer.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>

                      {/* Progress Bar */}
                      {(transfer.status === 'active' || transfer.status === 'pending') && (
                        <Box sx={{ mb: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={transfer.progress}
                            sx={{ height: 4, borderRadius: 1 }}
                          />
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {transfer.progress.toFixed(0)}%
                            </Typography>
                            {transfer.status === 'active' && (
                              <Typography variant="caption" color="text.secondary">
                                {formatSpeed(speed)} • {formatTimeRemaining(timeRemaining)}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      )}

                      {/* Status Chip */}
                      {(transfer.status === 'completed' || transfer.status === 'error') && (
                        <Chip
                          label={transfer.status === 'completed' ? 'Completed' : 'Failed'}
                          size="small"
                          color={transfer.status === 'completed' ? 'success' : 'error'}
                          variant="outlined"
                          sx={{ alignSelf: 'flex-start' }}
                        />
                      )}

                      {/* Expanded Details */}
                      <Collapse in={isExpanded}>
                        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Type: {transfer.type === 'upload' ? 'Upload' : 'Download'}
                          </Typography>
                          {transfer.error && (
                            <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.5 }}>
                              Error: {transfer.error}
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </ListItem>
                    <Divider />
                  </Box>
                );
              })}
            </List>
          )}
        </Box>

        {/* Footer Actions */}
        {(completedTransfers.length > 0 || failedTransfers.length > 0) && (
          <Box
            sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Button
              fullWidth
              variant="outlined"
              size="small"
              onClick={clearCompleted}
            >
              Clear Completed
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
