import { Badge, IconButton, Box, LinearProgress, Tooltip } from '@mui/material';
import {
  SwapVert as TransferIcon,
} from '@mui/icons-material';
import { useTransferStore } from '../store/transferStore';

export default function TransferButton() {
  const { transfers, toggleOpen } = useTransferStore();

  const activeTransfers = transfers.filter(
    (t) => t.status === 'active' || t.status === 'pending'
  );

  const totalProgress = activeTransfers.length > 0
    ? activeTransfers.reduce((sum, t) => sum + t.progress, 0) / activeTransfers.length
    : 0;

  const hasActiveTransfers = activeTransfers.length > 0;

  return (
    <Tooltip title="Transfers">
      <Box sx={{ position: 'relative' }}>
        <IconButton onClick={toggleOpen} color="inherit">
          <Badge badgeContent={activeTransfers.length} color="primary">
            <TransferIcon />
          </Badge>
        </IconButton>
        {hasActiveTransfers && (
          <LinearProgress
            variant="determinate"
            value={totalProgress}
            sx={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80%',
              height: 3,
              borderRadius: 1,
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}
