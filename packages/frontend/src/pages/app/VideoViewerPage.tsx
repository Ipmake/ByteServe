import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';

export default function VideoViewerPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');

  useEffect(() => {
    fetchVideo();
  }, [objectId]);

  const fetchVideo = async () => {
    if (!objectId || !token) {
      setError('Missing object ID or token');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/objects/${objectId}/content`, {
        headers: { Authorization: token },
      });

      if (!response.ok) {
        throw new Error('Failed to load video');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to load video');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#000' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#000', p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: '#000',
        p: 2,
      }}
    >
      <video
        src={videoUrl}
        controls
        autoPlay
        style={{
          maxWidth: '100%',
          maxHeight: '100vh',
        }}
      />
    </Box>
  );
}
