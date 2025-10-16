import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { Save as SaveIcon, Download as DownloadIcon } from '@mui/icons-material';
import Editor from '@monaco-editor/react';
import { apiService } from '../../api';

export default function TextEditorPage() {
  const { objectId } = useParams<{ objectId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchContent();
  }, [objectId]);

  const fetchContent = async () => {
    if (!objectId) {
      setError('Missing object ID');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiService.getObjectContent(objectId);
      setContent(data.content);
      setFilename(data.filename);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const getLanguage = () => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      json: 'json',
      html: 'html',
      css: 'css',
      md: 'markdown',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'shell',
      bash: 'shell',
      sql: 'sql',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const handleSave = async () => {
    if (!objectId) return;

    try {
      await apiService.saveObjectContent(objectId, content);
      setHasChanges(false);
      // Optional: Show success message
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save file');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {filename}
          </Typography>
          <Button
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges}
            sx={{ mr: 1 }}
          >
            Save
          </Button>
          <Button
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
          >
            Download
          </Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          language={getLanguage()}
          value={content}
          onChange={(value) => {
            setContent(value || '');
            setHasChanges(true);
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </Box>
    </Box>
  );
}
