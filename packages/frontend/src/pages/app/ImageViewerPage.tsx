import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';

export default function ImageViewerPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    fetchImage();
  }, [objectId]);

  const fetchImage = async () => {
    if (!objectId || !token) {
      setError('Missing object ID or token');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:3001/api/objects/${objectId}/content`, {
        headers: { Authorization: token },
      });

      if (!response.ok) {
        throw new Error('Failed to load image');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to load image');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

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
      <img
        src={imageUrl}
        alt="Viewer"
        style={{
          maxWidth: '100%',
          maxHeight: '100vh',
          objectFit: 'contain',
        }}
      />
    </Box>
  );
}
