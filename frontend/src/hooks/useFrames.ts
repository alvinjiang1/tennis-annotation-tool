import { useState, useEffect } from 'react';
import { videoService, inferenceService } from '../services';

interface UseFramesResult {
  frames: string[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export default function useFrames(videoFilename: string, labelShots: boolean): UseFramesResult {
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState<number>(0);

  useEffect(() => {
    if (!videoFilename) return;

    const fetchFrames = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (labelShots) {
          // Fetch predicted frames (inference results)
          const inferenceFrames = await inferenceService.getInferenceFrames(videoFilename);
          setFrames(inferenceFrames);
        } else {
          // Fetch original frames
          const videoFrames = await videoService.getVideoFrames(videoFilename);
          setFrames(videoFrames);
        }
      } catch (err) {
        console.error("Failed to fetch frames:", err);
        setError("Failed to fetch frames. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchFrames();
  }, [videoFilename, labelShots, reloadCounter]);

  const reload = () => setReloadCounter(prev => prev + 1);

  return { frames, loading, error, reload };
}