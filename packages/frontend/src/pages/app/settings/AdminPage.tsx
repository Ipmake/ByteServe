import {
  Typography,
  Box,
  Paper,
  CircularProgress,
  Alert,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Switch,
  FormControlLabel,
  Button,
  Autocomplete,
  Chip,
  Stack,
  Collapse,
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import { useAuthStore } from "../../../states/authStore";
import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiService } from "../../../api";

export default function AdminPage() {
  const { user } = useAuthStore();
  const [configs, setConfigs] = useState<Config.ConfigItem[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = () => {
    setLoading(true);
    setError(null);
    apiService
      .getConfig()
      .then((data) => {
        if (data.length === 0) {
          setError("No configuration items found.");
          return;
        }
        setConfigs(data);
        setEditedValues({});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const handleValueChange = (key: string, value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    const changedItems = Object.entries(editedValues).map(([key, value]) => ({
      key,
      value,
    }));

    if (changedItems.length === 0) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiService.updateConfigItemsBulk(changedItems);
      loadConfigs();
    } catch (e: any) {
      setError(e.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const getCurrentValue = (config: Config.ConfigItem): string => {
    return editedValues[config.key] ?? config.value;
  };

  const renderInput = (config: Config.ConfigItem) => {
    const currentValue = getCurrentValue(config);
    const hasChanged = editedValues[config.key] !== undefined;

    switch (config.type) {
      case "BOOLEAN":
        return (
          <FormControlLabel
            control={
              <Switch
                checked={currentValue === "true"}
                onChange={(e) =>
                  handleValueChange(
                    config.key,
                    e.target.checked ? "true" : "false"
                  )
                }
                color="primary"
              />
            }
            label={currentValue === "true" ? "Enabled" : "Disabled"}
          />
        );

      case "NUMBER":
        return (
          <TextField
            type="number"
            value={currentValue}
            onChange={(e) => handleValueChange(config.key, e.target.value)}
            fullWidth
            size="small"
            variant="outlined"
            error={hasChanged && isNaN(Number(currentValue))}
            helperText={
              hasChanged && isNaN(Number(currentValue))
                ? "Must be a valid number"
                : ""
            }
          />
        );

      case "SELECT":
        return (
          <FormControl fullWidth size="small">
            <Select
              value={currentValue}
              onChange={(e) => handleValueChange(config.key, e.target.value)}
            >
              {config.selectOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case "STRING":
      default:
        if (config.selectOptions.length > 0) {
          return (
            <Autocomplete
              freeSolo
              options={config.selectOptions}
              value={currentValue}
              onChange={(_, newValue) =>
                handleValueChange(config.key, newValue || "")
              }
              onInputChange={(_, newValue) =>
                handleValueChange(config.key, newValue)
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  variant="outlined"
                  fullWidth
                />
              )}
            />
          );
        }
        return (
          <TextField
            value={currentValue}
            onChange={(e) => handleValueChange(config.key, e.target.value)}
            fullWidth
            size="small"
            variant="outlined"
            multiline={currentValue.length > 50}
            maxRows={4}
          />
        );
    }
  };

  const groupedConfigs = configs.reduce<Record<string, Config.ConfigItem[]>>(
    (acc, config) => {
      const category = config.category || "general";
      if (!acc[category]) acc[category] = [];
      acc[category].push(config);
      return acc;
    },
    {}
  );

  // Sort categories with 'general' first
  const sortedCategories = Object.keys(groupedConfigs).sort((a, b) => {
    if (a.toLowerCase() === "general") return -1;
    if (b.toLowerCase() === "general") return 1;
    return a.localeCompare(b);
  });

  const hasChanges = Object.keys(editedValues).length > 0;

  if (!user?.isAdmin) {
    return <Navigate to="/app/settings/account" replace />;
  }

  return (
    <Box sx={{ pb: 3, maxWidth: 1200, mx: "auto" }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h5" fontWeight={600}>
          System Configuration
        </Typography>
        <Collapse in={hasChanges} orientation="horizontal">
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              label={`${Object.keys(editedValues).length} unsaved change${
                Object.keys(editedValues).length > 1 ? "s" : ""
              }`}
              sx={{
                // disable all sorts of wrapping
                whiteSpace: "nowrap",
                textTransform: "none",
              }}
            />
            <Button
              variant="contained"
              startIcon={
                saving ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <SaveIcon />
                )
              }
              onClick={handleSave}
              disabled={saving}
              sx={{
                // disable all sorts of wrapping
                whiteSpace: "nowrap",
                textTransform: "none",
              }}
            >
              Save Changes
            </Button>
          </Stack>
        </Collapse>
      </Stack>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && (
        <Stack spacing={3}>
          {sortedCategories.map((category) => (
            <Paper
              key={category}
              elevation={0}
              sx={{ p: 3, border: 1, borderColor: "divider" }}
            >
              <Typography
                variant="h6"
                sx={{
                  mb: 3,
                  pb: 1.5,
                  borderBottom: 2,
                  borderColor: "primary.main",
                  textTransform: "capitalize",
                  fontWeight: 600,
                }}
              >
                {category}
              </Typography>
              <Stack spacing={3}>
                {groupedConfigs[category].map((config) => (
                  <Box key={config.key}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      sx={{ mb: 0.5 }}
                    >
                      {config.key}
                    </Typography>
                    {config.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1.5 }}
                      >
                        {config.description}
                      </Typography>
                    )}
                    <Box sx={{ maxWidth: 600 }}>{renderInput(config)}</Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
