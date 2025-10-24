import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  DialogActions,
  Button,
} from "@mui/material";
import { useState } from "react";
import { apiService } from "../api";

function FileReqModal({
  open,
  onClose,
  bucketId,
  parentId,
}: {
  open: boolean;
  onClose: (fileReqId: string | null) => void;
  bucketId: string;
  parentId: string | null;
}) {
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [filename, setFilename] = useState("");

  const [loading, setLoading] = useState(false);

  const inputValid = filename.length <= 128 && filename.length >= 3;

  return (
    <Dialog open={open} fullWidth>
      <DialogTitle>Create File Upload Request</DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          gap: 2,
          flexDirection: "column",
        }}
      >
        <Typography variant="body2" sx={{ mt: 0 }}>
          Adjust settings for the file upload request.
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={requireApiKey}
              onChange={(e) => setRequireApiKey(e.target.checked)}
            />
          }
          label="Require API Key"
        />

        <TextField
          label="Filename to upload as (optional)"
          fullWidth
          value={filename}
          onChange={(e) => {
            // max 128 characters
            if (e.target.value.length <= 128) {
              setFilename(e.target.value);
            }
          }}
          placeholder="myfile.png"
        />
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => onClose(null)}
          color="primary"
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={async () => {
            // Handle create file request logic here
            setLoading(true);

            const fileReq = await apiService.createFileRequest({
              bucket: bucketId,
              parent: parentId,
              filename: filename || undefined,
              requireApiKey,
            });

            onClose(fileReq.id);

            setLoading(false);
          }}
          color="primary"
          variant="contained"
          disabled={loading || !inputValid}
        >
          Create Request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FileReqModal;
