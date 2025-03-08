// Check if model has been trained and is ready for inference
const checkInferenceReadiness = async (videoId: string): Promise<boolean> => {
  try {
    const response = await fetch(`http://localhost:5000/api/inference/check-readiness/${videoId}`);
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.ready;
  } catch (error) {
    console.error('Error checking inference readiness:', error);
    return false;
  }
};import { useState, useEffect } from 'react';
import { startTraining, getTrainingStatus, checkVideoReadiness } from '../../../services/api';
import { useToast } from '../../../hooks';

interface Video {
id: string;
name: string;
ready: boolean;
frames?: boolean;
annotations?: boolean;
readinessMessage?: string;
modelTrained?: boolean;
}

interface Status {
running: boolean;
last_status: string | null;
completed?: boolean;
}

export default function TrainingView() {
const [selectedVideo, setSelectedVideo] = useState<string>('');
const [availableVideos, setAvailableVideos] = useState<Video[]>([]);
const [loading, setLoading] = useState(false);
const [trainingStatus, setTrainingStatus] = useState<Status>({ 
  running: false, 
  last_status: null,
  completed: false
});
const [inferenceStatus, setInferenceStatus] = useState<Status>({ 
  running: false, 
  last_status: null 
});
const { showToast } = useToast();

// Fetch available videos and check their readiness status
useEffect(() => {
  const fetchVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/video/list');
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }
      
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
      showToast('Failed to fetch available videos', 'error');
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
      
      if (!status.running && status.last_status) {
        if (status.last_status.toLowerCase().includes('success') || 
            status.last_status.toLowerCase().includes('completed')) {
          showToast('Training completed successfully!', 'success');
        } else if (status.last_status.toLowerCase().includes('fail') ||
                   status.last_status.toLowerCase().includes('error')) {
          showToast('Training encountered an issue', 'error');
        }
        
        window.clearInterval(trainingIntervalId);
      }
    }, 5000);
  }

  if (inferenceStatus.running) {
    inferenceIntervalId = window.setInterval(async () => {
      try {
        const response = await fetch('http://localhost:5000/api/inference/run/status');
        if (!response.ok) {
          throw new Error('Failed to fetch inference status');
        }
        
        const status = await response.json();
        setInferenceStatus(status);
        
        if (!status.running && status.last_status) {
          if (status.last_status.toLowerCase().includes('success') || 
              status.last_status.toLowerCase().includes('completed')) {
            showToast('Inference completed successfully!', 'success');
          } else if (status.last_status.toLowerCase().includes('fail') ||
                     status.last_status.toLowerCase().includes('error')) {
            showToast('Inference encountered an issue', 'error');
          }
          
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
}, [trainingStatus.running, inferenceStatus.running, showToast]);

const handleStartTraining = async () => {
  if (!selectedVideo) {
    showToast('Please select a video first', 'warning');
    return;
  }

  setLoading(true);

  try {
    const readiness = await checkVideoReadiness(selectedVideo);
    if (!readiness.frames || !readiness.annotations) {
      showToast('Video is not ready for training. Please ensure frames are extracted and annotations are complete.', 'warning');
      setLoading(false);
      return;
    }

    // Reset training environment first if needed
    if (trainingStatus.completed) {
      try {
        const resetResponse = await fetch('http://localhost:5000/api/training/train/reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ video_id: selectedVideo }),
        });
        
        if (!resetResponse.ok) {
          const errorData = await resetResponse.json();
          throw new Error(errorData.message || 'Failed to prepare for retraining');
        }
        
        showToast('Training environment prepared for retraining', 'info');
      } catch (resetError) {
        console.error('Error preparing for retraining:', resetError);
        showToast('Unable to prepare for retraining, training may fail', 'warning');
      }
    }

    const success = await startTraining(selectedVideo);
    if (success) {
      showToast('Training started successfully!', 'success');
      setTrainingStatus({ running: true, last_status: 'Starting training...', completed: false });
    } else {
      showToast('Failed to start training', 'error');
    }
  } catch (error) {
    showToast('Error starting training', 'error');
  } finally {
    setLoading(false);
  }
};

const handleResetTraining = async () => {
  if (!selectedVideo) {
    showToast('Please select a video first', 'warning');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('http://localhost:5000/api/training/train/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_id: selectedVideo }),
    });

    if (response.ok) {
      showToast('Training environment prepared for retraining', 'success');
      setTrainingStatus({ running: false, last_status: 'Ready for retraining', completed: false });
    } else {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to reset training environment');
    }
  } catch (error) {
    console.error('Error resetting training:', error);
    showToast('Failed to prepare environment for retraining', 'error');
  } finally {
    setLoading(false);
  }
};

const handleStartInference = async () => {
  if (!selectedVideo) {
    showToast('Please select a video first', 'warning');
    return;
  }

  setLoading(true);

  try {
    // First check if the model is ready for inference
    const isReady = await checkInferenceReadiness(selectedVideo);
    
    if (!isReady) {
      showToast('Model has not been fully trained yet. Please train the model first.', 'warning');
      setLoading(false);
      return;
    }

    const response = await fetch('http://localhost:5000/api/inference/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_id: selectedVideo }),
    });

    if (response.ok) {
      showToast('Inference started successfully!', 'success');
      setInferenceStatus({ running: true, last_status: 'Starting inference...' });
    } else {
      const errorData = await response.json();
      showToast(`Failed to start inference: ${errorData.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Error starting inference:', error);
    showToast('Error starting inference', 'error');
  } finally {
    setLoading(false);
  }
};

// Check if model has been trained and is ready for inference
const refreshVideoStatus = async (videoId: string) => {
  try {
    setLoading(true);
    // Check annotation readiness
    const readiness = await checkVideoReadiness(videoId);
    
    // Check if model is trained and ready for inference
    const inferenceReady = await checkInferenceReadiness(videoId);
    
    setAvailableVideos(prevVideos => 
      prevVideos.map(video => 
        video.id === videoId 
          ? {
              ...video,
              frames: readiness.frames,
              annotations: readiness.annotations,
              readinessMessage: readiness.message,
              ready: readiness.frames && readiness.annotations,
              modelTrained: inferenceReady
            }
          : video
      )
    );
    showToast('Video status refreshed', 'info');
  } catch (error) {
    console.error('Error refreshing video status:', error);
    showToast(`Failed to refresh status for video ${videoId}`, 'error');
  } finally {
    setLoading(false);
  }
};

const selectedVideoDetails = availableVideos.find(v => v.id === selectedVideo);
const isOperationInProgress = loading || trainingStatus.running || inferenceStatus.running;
const isVideoReady = selectedVideoDetails?.ready || false;

return (
  <div className="space-y-6">
    {/* Page Header */}
    <div className="flex justify-between items-center">
      <h2 className="text-2xl font-bold">Training & Inference</h2>
      {isOperationInProgress && (
        <div className="badge badge-primary gap-2">
          <span className="loading loading-spinner loading-xs"></span>
          Processing
        </div>
      )}
    </div>
    
    {/* Main Content */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Video Selection */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title text-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Select Video
          </h3>
          
          <div className="form-control">
            <div className="input-group">
              <select
                className="select select-bordered w-full"
                value={selectedVideo}
                onChange={(e) => {
                  setSelectedVideo(e.target.value);
                  if (e.target.value) {
                    refreshVideoStatus(e.target.value);
                  }
                }}
                disabled={isOperationInProgress}
              >
                <option value="">Select a video...</option>
                {availableVideos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {video.name} {!video.ready ? '(Processing...)' : ''}
                  </option>
                ))}
              </select>
              <button 
                className="btn btn-square"
                onClick={() => selectedVideo && refreshVideoStatus(selectedVideo)}
                disabled={isOperationInProgress || !selectedVideo}
                title="Refresh status"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          
          {availableVideos.length === 0 ? (
            <div className="alert alert-info mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>No videos available. Please upload and annotate videos first.</span>
            </div>
          ) : (
            <p className="text-sm mt-2 text-base-content/70">
              {availableVideos.filter(v => v.ready).length} of {availableVideos.length} videos ready for processing.
            </p>
          )}
          
          {selectedVideoDetails && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Video Status</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 ${selectedVideoDetails.frames ? 'bg-primary' : 'bg-base-300'}`}></div>
                    <span>Frame Extraction</span>
                  </div>
                  {selectedVideoDetails.frames ? 
                    <span className="badge badge-success">Complete</span> : 
                    <span className="badge badge-warning">Pending</span>}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 ${selectedVideoDetails.annotations ? 'bg-primary' : 'bg-base-300'}`}></div>
                    <span>Annotations</span>
                  </div>
                  {selectedVideoDetails.annotations ? 
                    <span className="badge badge-success">Complete</span> : 
                    <span className="badge badge-warning">Pending</span>}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 ${selectedVideoDetails.ready ? 'bg-primary' : 'bg-base-300'}`}></div>
                    <span>Ready for Processing</span>
                  </div>
                  {selectedVideoDetails.ready ? 
                    <span className="badge badge-success">Ready</span> : 
                    <span className="badge badge-warning">Not Ready</span>}
                </div>
              </div>
              
              {selectedVideoDetails.readinessMessage && (
                <div className={`alert ${selectedVideoDetails.ready ? 'alert-success' : 'alert-warning'} mt-4`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{selectedVideoDetails.readinessMessage}</span>
                </div>
              )}
              
              <div className="flex justify-end mt-4">
                <button 
                  className="btn btn-sm btn-outline"
                  onClick={() => refreshVideoStatus(selectedVideoDetails.id)}
                  disabled={isOperationInProgress}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh Status
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Middle Column - Training */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title text-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Training
          </h3>
          
          <div className="text-sm space-y-2 my-4">
            <p>Train the model on your annotated tennis frames to recognize players.</p>
            <p>This process may take several minutes to complete.</p>
          </div>
          
          {trainingStatus.running ? (
            <div className="mt-4">
              <div className="flex justify-between mb-2">
                <span className="font-medium">Training in progress</span>
                <span className="loading loading-spinner loading-sm"></span>
              </div>
              <progress className="progress progress-primary w-full"></progress>
              
              {trainingStatus.last_status && (
                <div className="mt-4 alert alert-info">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span className="text-sm">{trainingStatus.last_status}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-2">
                <button 
                  className="btn btn-primary"
                  onClick={handleStartTraining}
                  disabled={isOperationInProgress || !selectedVideo || !isVideoReady}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Training
                </button>
                
                {trainingStatus.completed && (
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={handleResetTraining}
                    disabled={isOperationInProgress || !selectedVideo}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset for Retraining
                  </button>
                )}
              </div>
              
              {!selectedVideo && (
                <div className="alert alert-warning shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Please select a video first</span>
                </div>
              )}
              
              {selectedVideo && !isVideoReady && (
                <div className="alert alert-warning shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>This video needs frames and annotations before training</span>
                </div>
              )}
            </div>
          )}
          
          {trainingStatus.last_status && !trainingStatus.running && (
            <div className="mt-4 alert alert-success">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{trainingStatus.last_status}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Right Column - Inference */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title text-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Inference
          </h3>
          
          <div className="text-sm space-y-2 my-4">
            <p>Run the trained model on your video to detect players in each frame.</p>
            <p>Make sure to complete training before running inference.</p>
          </div>
          
          {inferenceStatus.running ? (
            <div className="mt-4">
              <div className="flex justify-between mb-2">
                <span className="font-medium">Inference in progress</span>
                <span className="loading loading-spinner loading-sm"></span>
              </div>
              <progress className="progress progress-secondary w-full"></progress>
              
              {inferenceStatus.last_status && (
                <div className="mt-4 alert alert-info">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span className="text-sm">{inferenceStatus.last_status}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <button
                className="btn btn-secondary"
                onClick={handleStartInference}
                disabled={isOperationInProgress || !selectedVideo || !isVideoReady}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Run Inference
              </button>
              
              {!selectedVideo && (
                <div className="alert alert-warning shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Please select a video first</span>
                </div>
              )}
            </div>
          )}
          
          {inferenceStatus.last_status && !inferenceStatus.running && (
            <div className="mt-4 alert alert-success">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{inferenceStatus.last_status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
    
    {/* Help Section */}
    <div className="collapse collapse-arrow bg-base-100 shadow-lg border border-base-300 rounded-lg">
      <input type="checkbox" /> 
      <div className="collapse-title font-medium text-base">
        <div className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Training & Inference Help
        </div>
      </div>
      <div className="collapse-content"> 
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
          <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
            <h4 className="text-base font-bold mb-3">Training Process</h4>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li className="text-sm">Select a video that has been uploaded and annotated</li>
              <li className="text-sm">The system checks if frames and annotations are ready</li>
              <li className="text-sm">Start the training process by clicking the "Start Training" button</li>
              <li className="text-sm">Wait for the training to complete (may take several minutes)</li>
              <li className="text-sm">Once training is complete, the model is ready for inference</li>
            </ol>
          </div>
          <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
            <h4 className="text-base font-bold mb-3">Inference Process</h4>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li className="text-sm">Select a trained video model</li>
              <li className="text-sm">Click "Run Inference" to process all video frames</li>
              <li className="text-sm">The system will detect players in each frame</li>
              <li className="text-sm">Once complete, you can view results in the Shot Labeling tab</li>
              <li className="text-sm">You can then label tennis shots using the detected players</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </div>
);
}