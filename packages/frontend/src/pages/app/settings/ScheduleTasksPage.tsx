import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Switch,
  IconButton,
  Tooltip,
  Alert,
  Modal,
  Button,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { apiService } from "../../../api";

interface ScheduleTask {
  id: string;
  displayName: string;
  enabled: boolean;
  cron: string;
  lastRun: string | null;
}

export default function ScheduleTasksPage() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCronParts, setEditCronParts] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
  ]);
  const [editEnabled, setEditEnabled] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [cronError, setCronError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState<{ [id: string]: boolean }>({});
  const [confirmRunId, setConfirmRunId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const data = await apiService.getScheduleTasks();
      setTasks(data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to fetch tasks");
    }
  };

  const handleEdit = (task: ScheduleTask) => {
    setEditId(task.id);
    setEditEnabled(task.enabled);
    setModalOpen(true);
    setEditCronParts(task.cron.split(" "));
  };

  function validateCron(parts: string[]): string | null {
    if (parts.length !== 5) return "Cron must have 5 fields";
    for (let i = 0; i < 5; i++) {
      if (!/^([*]|\d+|\d+-\d+|\d+(,\d+)*|\d+\/\d+)$/.test(parts[i])) {
        return `Invalid value in field ${i + 1}`;
      }
    }
    return null;
  }

  const handleSave = async () => {
    if (!editId) return;
    const error = validateCron(editCronParts);
    setCronError(error);
    if (error) return;
    const cronString = editCronParts.join(" ");
    try {
      await apiService.updateScheduleTask(editId, {
        cron: cronString,
        enabled: editEnabled,
      });
      setEditId(null);
      setEditCronParts(["", "", "", "", ""]);
      setEditEnabled(true);
      setModalOpen(false);
      fetchTasks();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update task");
    }
  };

  const handleCancel = () => {
    setEditId(null);
    setEditEnabled(true);
    setEditCronParts(["", "", "", "", ""]);
    setModalOpen(false);
  };

  const handleRun = async (id: string) => {
    setRunLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await apiService.runScheduleTask(id);
      fetchTasks();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to run task");
    } finally {
      setRunLoading((prev) => ({ ...prev, [id]: false }));
      setConfirmRunId(null);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Scheduled Tasks
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Display Name</TableCell>
              <TableCell>Enabled</TableCell>
              <TableCell>Cron String</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell align="right"></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id} hover>
                <TableCell>{task.id}</TableCell>
                <TableCell>{task.displayName}</TableCell>
                <TableCell>
                  <Switch checked={task.enabled} disabled />
                </TableCell>
                <TableCell sx={{ minWidth: 180, maxWidth: 320 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                  >
                    {task.cron}
                  </Typography>
                </TableCell>
                <TableCell>
                  {task.lastRun ? new Date(task.lastRun).toLocaleString() : "-"}
                </TableCell>
                <TableCell
                  align="right"
                  style={{
                    gap: 8,
                  }}
                >
                  <Tooltip title="Run now">
                    <span>
                      <IconButton
                        color="primary"
                        size="small"
                        disabled={!!runLoading?.[task.id]}
                        onClick={() => setConfirmRunId(task.id)}
                      >
                        {runLoading?.[task.id] ? (
                          <CircularProgress size={20} />
                        ) : (
                          <PlayArrowIcon />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton
                      onClick={() => handleEdit(task)}
                      color="primary"
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Modal open={modalOpen} onClose={handleCancel}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "background.paper",
            p: 4,
            borderRadius: 2,
            minWidth: 400,
            boxShadow: 24,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Edit Scheduled Task
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Switch
              checked={editEnabled}
              onChange={(e) => setEditEnabled(e.target.checked)}
            />{" "}
            Enabled
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Cron String
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                value={editCronParts[0]}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, "");
                  const parts = [...editCronParts];
                  parts[0] = v;
                  setEditCronParts(parts);
                  setCronError(validateCron(parts));
                }}
                size="small"
                placeholder="min"
                error={!!cronError && cronError.includes("1")}
                inputProps={{ style: { fontFamily: "monospace", width: 40 } }}
              />
              <TextField
                value={editCronParts[1]}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, "");
                  const parts = [...editCronParts];
                  parts[1] = v;
                  setEditCronParts(parts);
                  setCronError(validateCron(parts));
                }}
                size="small"
                placeholder="hour"
                error={!!cronError && cronError.includes("2")}
                inputProps={{ style: { fontFamily: "monospace", width: 40 } }}
              />
              <TextField
                value={editCronParts[2]}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, "");
                  const parts = [...editCronParts];
                  parts[2] = v;
                  setEditCronParts(parts);
                  setCronError(validateCron(parts));
                }}
                size="small"
                placeholder="day"
                error={!!cronError && cronError.includes("3")}
                inputProps={{ style: { fontFamily: "monospace", width: 40 } }}
              />
              <TextField
                value={editCronParts[3]}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, "");
                  const parts = [...editCronParts];
                  parts[3] = v;
                  setEditCronParts(parts);
                  setCronError(validateCron(parts));
                }}
                size="small"
                placeholder="month"
                error={!!cronError && cronError.includes("4")}
                inputProps={{ style: { fontFamily: "monospace", width: 40 } }}
              />
              <TextField
                value={editCronParts[4]}
                onChange={(e) => {
                  const v = e.target.value.replace(/\s/g, "");
                  const parts = [...editCronParts];
                  parts[4] = v;
                  setEditCronParts(parts);
                  setCronError(validateCron(parts));
                }}
                size="small"
                placeholder="weekday"
                error={!!cronError && cronError.includes("5")}
                inputProps={{ style: { fontFamily: "monospace", width: 60 } }}
              />
            </Box>
            <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
              <b>{editCronParts.join(" ")}</b>
            </Typography>
            <Typography
              variant="caption"
              color={cronError ? "error" : "text.secondary"}
            >
              {cronError ? cronError : "Format: min hour day month weekday"}
            </Typography>
          </Box>
          <Box
            sx={{ display: "flex", gap: 2, mt: 3, justifyContent: "flex-end" }}
          >
            <Button onClick={handleCancel} color="inherit" variant="outlined">
              Cancel
            </Button>
            <Button onClick={handleSave} color="primary" variant="contained">
              Save
            </Button>
          </Box>
        </Box>
      </Modal>

      {/* Confirmation dialog for running a task */}
      <Dialog open={!!confirmRunId} onClose={() => setConfirmRunId(null)}>
        <DialogTitle>Run Scheduled Task</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to run this scheduled task now? This may take
            a while to complete.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRunId(null)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={() => confirmRunId && handleRun(confirmRunId)}
            color="primary"
            variant="contained"
            disabled={!!runLoading?.[confirmRunId!]}
          >
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
