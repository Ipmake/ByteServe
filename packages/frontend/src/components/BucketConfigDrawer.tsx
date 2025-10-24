import {
  Drawer,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  CircularProgress,
  IconButton,
  Typography,
  Box,
  Collapse,
  Alert,
} from "@mui/material";
import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { apiService } from "../api";

function BucketConfigDrawer({
  bucketId,
  onClose,
}: {
  bucketId: string | null;
  onClose?: () => void;
}) {
  const isOpen = Boolean(bucketId);
  const [data, setData] = useState<Config.BucketConfigItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bucketId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    apiService
      .getBucketConfig(bucketId)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(
          err.response?.data?.error ||
            err.message ||
            "Failed to fetch bucket config"
        );
        console.error("Failed to fetch bucket config", err);
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [bucketId]);

  const handleValueChange = (index: number, newValue: string) => {
    if (!data) return;
    const updated = [...data];
    updated[index] = { ...updated[index], value: newValue };
    setData(updated);
  };

  const handleSave = async () => {
    if (!data) return;

    setSaving(true);
    try {
      await saveBucketConfig(bucketId!, data);
      console.log("Saving all config items:", data);
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setSaving(false);
    }
  };

  // Placeholder save function
  const saveBucketConfig = async (
    bucketId: string,
    items: Config.BucketConfigItem[]
  ) => {
    apiService
      .updateBucketConfigItemsBulk(
        bucketId,
        items.map((item) => ({
          key: item.key,
          value: item.value,
        }))
      )
      .then(() => {
        onClose && onClose();
      })
      .catch((err) => {
        console.error("Failed to save config items", err);
        setError(
          err.response?.data?.error ||
            err.message ||
            "Failed to save bucket config"
        );
      });
  };

  const renderInput = (item: Config.BucketConfigItem, index: number) => {
    switch (item.type) {
      case "BOOLEAN":
        return (
          <FormControlLabel
            control={
              <Switch
                checked={item.value === "true"}
                onChange={(e) =>
                  handleValueChange(index, e.target.checked.toString())
                }
                sx={{ ml: 1 }}
              />
            }
            label=""
            sx={{ m: 0 }}
          />
        );
      case "NUMBER":
        return (
          <TextField
            type="number"
            value={item.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
            sx={{ maxWidth: 200 }}
          />
        );
      case "STRING":
      default:
        return (
          <TextField
            value={item.value}
            onChange={(e) => handleValueChange(index, e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
          />
        );
    }
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      anchor="right"
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 480 },
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Box
          sx={{
            p: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6">Configuration</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Collapse in={Boolean(error)}>
          <Alert severity="error" sx={{ mx: 3, mb: 2 }}>
            {error}
          </Alert>  
        </Collapse>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto", p: 3 }}>
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: 200,
              }}
            >
              <CircularProgress size={32} />
            </Box>
          ) : data && data.length > 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {data.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    p: 2.5,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      mb: 1.5,
                      fontWeight: 500,
                    }}
                  >
                    {item.key}
                  </Typography>
                  {renderInput(item, index)}
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography color="text.secondary">
                No configuration items found
              </Typography>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box
          sx={{
            p: 3,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            variant="contained"
            fullWidth
            onClick={handleSave}
            disabled={saving || !data}
            sx={{
              textTransform: "none",
              py: 1.25,
            }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Save Configuration"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}

export default BucketConfigDrawer;
