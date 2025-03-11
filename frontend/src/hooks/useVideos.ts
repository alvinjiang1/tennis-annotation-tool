import { useState, useEffect } from 'react';
import { videoService } from '../services';

interface UseVideosResult {
  videos: string[];
  loading: boolean;
  error: string | null;
  selectedVideo: string | null;
  setSelectedVideo: (video: string | null) => void;
  refreshVideos: () => void;
}

export default function useVideos(): UseVideosResult {
  const [videos, setVideos] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const uploadedVideos = await videoService.getUploadedVideos();
        setVideos(uploadedVideos);
      } catch (err) {
        console.error("Failed to fetch videos:", err);
        setError("Failed to fetch videos. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [refreshCounter]);

  const refreshVideos = () => setRefreshCounter(prev => prev + 1);

  return { 
    videos, 
    loading, 
    error, 
    selectedVideo, 
    setSelectedVideo, 
    refreshVideos 
  };
}