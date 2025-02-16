import { useState, useEffect } from 'react';
import { startTraining, getTrainingStatus, checkVideoReadiness } from './api';

interface Video {
  id: string;
  name: string;
  ready: boolean;
  frames?: boolean;
  annotations?: boolean;
  readinessMessage?: string;
}

interface Status {
  running: boolean;
  last_status: string | null;
}

export default function TrainingTab() {
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [availableVideos, setAvailableVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<Status>({ 
    running: false, 
    last_status: null 
  });
  const [inferenceStatus, setInferenceStatus] = useState<Status>({ 
    running: false, 
    last_status: null 
  });

  // Fetch available videos and check their readiness status
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5000/api/video/list');
        const videos = await response.json();
        
        const initialVideos = videos.map((video: any) => ({
          id: video.id,
          name: video.name,
          ready: false,
          frames: false,
          annotations: false
        }));
        
        const updatedVideos = await Promise.all(
          initialVideos.map(async (video: Video) => {
            const readiness = await checkVideoReadiness(video.id);
            return {
              ...video,
              frames: readiness.frames,
              annotations: readiness.annotations,
              readinessMessage: readiness.message,
              ready: readiness.frames && readiness.annotations
            };
          })
        );
        
        setAvailableVideos(updatedVideos);
      } catch (error) {
        console.error('Error fetching videos:', error);
        setMessage('Failed to fetch available videos');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  // Poll training and inference status
  useEffect(() => {
    let trainingIntervalId: number;
    let inferenceIntervalId: number;

    if (trainingStatus.running) {
      trainingIntervalId = window.setInterval(async () => {
        const status = await getTrainingStatus();
        setTrainingStatus(status);
        
        if (!status.running) {
          window.clearInterval(trainingIntervalId);
        }
      }, 5000);
    }

    if (inferenceStatus.running) {
      inferenceIntervalId = window.setInterval(async () => {
        try {
          const response = await fetch('http://localhost:5000/api/run/status');
          const status = await response.json();
          setInferenceStatus(status);
          
          if (!status.running) {
            window.clearInterval(inferenceIntervalId);
          }
        } catch (error) {
          console.error('Error checking inference status:', error);
          setInferenceStatus(prev => ({ ...prev, running: false }));
          window.clearInterval(inferenceIntervalId);
        }
      }, 5000);
    }

    return () => {
      if (trainingIntervalId) window.clearInterval(trainingIntervalId);
      if (inferenceIntervalId) window.clearInterval(inferenceIntervalId);
    };
  }, [trainingStatus.running, inferenceStatus.running]);

  const handleStartTraining = async () => {
    if (!selectedVideo) {
      setMessage('Please select a video');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const readiness = await checkVideoReadiness(selectedVideo);
      if (!readiness.frames || !readiness.annotations) {
        setMessage('Video is not ready for training. Please ensure frames are extracted and annotations are complete.');
        return;
      }

      const success = await startTraining(selectedVideo);
      if (success) {
        setMessage('Training started successfully!');
        setTrainingStatus({ running: true, last_status: 'Starting training...' });
      } else {
        setMessage('Failed to start training');
      }
    } catch (error) {
      setMessage('Error starting training');
    } finally {
      setLoading(false);
    }
  };

  const handleStartInference = async () => {
    if (!selectedVideo) {
      setMessage('Please select a video');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:5000/api/inference/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_id: selectedVideo }),
      });

      if (response.ok) {
        setMessage('Inference started successfully!');
        setInferenceStatus({ running: true, last_status: 'Starting inference...' });
      } else {
        setMessage('Failed to start inference');
      }
    } catch (error) {
      console.error('Error starting inference:', error);
      setMessage('Error starting inference');
    } finally {
      setLoading(false);
    }
  };

  const refreshVideoStatus = async (videoId: string) => {
    try {
      const readiness = await checkVideoReadiness(videoId);
      setAvailableVideos(prevVideos => 
        prevVideos.map(video => 
          video.id === videoId 
            ? {
                ...video,
                frames: readiness.frames,
                annotations: readiness.annotations,
                readinessMessage: readiness.message,
                ready: readiness.frames && readiness.annotations
              }
            : video
        )
      );
    } catch (error) {
      console.error('Error refreshing video status:', error);
      setMessage(`Failed to refresh status for video ${videoId}`);
    }
  };

  const readyVideos = availableVideos.filter(video => video.ready);
  const selectedVideoDetails = availableVideos.find(v => v.id === selectedVideo);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Training & Inference</h2>
      
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Select Video</h3>
        <div className="flex flex-col gap-4">
          <select
            className="select select-bordered w-full"
            value={selectedVideo}
            onChange={(e) => {
              setSelectedVideo(e.target.value);
              if (e.target.value) {
                refreshVideoStatus(e.target.value);
              }
            }}
            disabled={trainingStatus.running || inferenceStatus.running}
          >
            <option value="">Select a video...</option>
            {availableVideos.map((video) => (
              <option key={video.id} value={video.id}>
                {video.name} {!video.ready && '(Processing...)'}
              </option>
            ))}
          </select>

          {selectedVideoDetails && (
            <div className="bg-gray-50 p-3 rounded">
              <h4 className="font-medium mb-2">Video Status:</h4>
              <div className="space-y-1">
                <p>Frames extracted: {selectedVideoDetails.frames ? '✓' : '×'}</p>
                <p>Annotations ready: {selectedVideoDetails.annotations ? '✓' : '×'}</p>
                {selectedVideoDetails.readinessMessage && (
                  <p className="text-gray-600 text-sm">{selectedVideoDetails.readinessMessage}</p>
                )}
                <button 
                  className="btn btn-sm btn-outline mt-2"
                  onClick={() => refreshVideoStatus(selectedVideoDetails.id)}
                  disabled={trainingStatus.running || inferenceStatus.running}
                >
                  Refresh Status
                </button>
              </div>
            </div>
          )}

          {availableVideos.length > 0 && readyVideos.length === 0 && (
            <div className="text-yellow-600 bg-yellow-50 p-3 rounded">
              No videos are ready. Please ensure videos are processed and annotated.
            </div>
          )}

          {availableVideos.length === 0 && (
            <div className="text-gray-600 bg-gray-50 p-3 rounded">
              No videos available. Please upload videos first.
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          className="btn btn-primary flex-1"
          onClick={handleStartTraining}
          disabled={loading || trainingStatus.running || inferenceStatus.running || !selectedVideo || !selectedVideoDetails?.ready}
        >
          {loading ? 'Starting...' : trainingStatus.running ? 'Training in Progress' : 'Start Training'}
        </button>

        <button
          className="btn btn-secondary flex-1"
          onClick={handleStartInference}
          disabled={loading || trainingStatus.running || inferenceStatus.running || !selectedVideo || !selectedVideoDetails?.ready}
        >
          {loading ? 'Starting...' : inferenceStatus.running ? 'Inference in Progress' : 'Start Inference'}
        </button>
      </div>

      {message && (
        <div className="mt-4 p-2 border rounded bg-gray-50">
          {message}
        </div>
      )}

      {(trainingStatus.running || inferenceStatus.running) && (
        <div className="mt-4 space-y-2">
          {trainingStatus.running && trainingStatus.last_status && (
            <div className="p-2 border rounded bg-blue-50">
              Training Status: {trainingStatus.last_status}
            </div>
          )}
          {inferenceStatus.running && inferenceStatus.last_status && (
            <div className="p-2 border rounded bg-green-50">
              Inference Status: {inferenceStatus.last_status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}