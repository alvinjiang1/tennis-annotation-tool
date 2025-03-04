import React, { useState, useEffect } from 'react';
import { useVideos } from '../../../hooks';

interface VideoUploaderProps {
  onSelectVideo: (videoUrl: string) => void;
  onUploadSuccess: (videoUrl: string) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onSelectVideo, onUploadSuccess }) => {
  const backendUrl = "http://localhost:5000";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Use our custom hook for managing uploaded videos
  const { 
    videos, 
    loading: loadingVideos, 
    error: videosError, 
    selectedVideo, 
    setSelectedVideo,
    refreshVideos
  } = useVideos();

  // Handle file selection through the input
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setError(null);
    }
  };
  
  // Handle file drop
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      setSelectedFile(event.dataTransfer.files[0]);
      setError(null);
    }
  };
  
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };
  
  // Handle video upload
  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a video file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("video", selectedFile);

    try {
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      
      // Using XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });
      
      xhr.open('POST', `${backendUrl}/api/video/upload`);
      
      xhr.onload = function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          onUploadSuccess(response.filename);
          setSelectedFile(null);
          refreshVideos(); // Refresh the video list
        } else {
          setError("Failed to upload video. Please try again.");
        }
        setUploading(false);
      };
      
      xhr.onerror = function() {
        setError("Network error during upload. Please try again.");
        setUploading(false);
      };
      
      xhr.send(formData);
    } catch (err) {
      setError("Failed to upload video.");
      console.error(err);
      setUploading(false);
    }
  };
  
  // Handle selection of existing video
  const handleLoadVideo = () => {
    if (selectedVideo) {
      onSelectVideo(selectedVideo);
    }
  };

  return (
    <div className="space-y-6">
      {/* Previously uploaded videos */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body">
          <h3 className="text-lg font-semibold">Previously Uploaded Videos</h3>
          
          {loadingVideos ? (
            <div className="flex justify-center p-4">
              <span className="loading loading-spinner"></span>
            </div>
          ) : videosError ? (
            <div className="alert alert-error">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Failed to load videos. Please refresh.</span>
            </div>
          ) : videos.length > 0 ? (
            <>
              <div className="form-control w-full">
                <select
                  className="select select-bordered w-full"
                  value={selectedVideo || ""}
                  onChange={(e) => setSelectedVideo(e.target.value)}
                >
                  <option value="">-- Select a Video --</option>
                  {videos.map((video, index) => (
                    <option key={index} value={video}>
                      {video}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                className="btn btn-primary w-full"
                disabled={!selectedVideo}
                onClick={handleLoadVideo}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Load Selected Video
              </button>
            </>
          ) : (
            <div className="alert">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>No uploaded videos found. Upload a new video below.</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Upload new video */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body">
          <h3 className="text-lg font-semibold">Upload a New Video</h3>
          
          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              selectedFile ? 'border-primary bg-primary/5' : 'border-base-300 hover:bg-base-300/10'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input 
              type="file" 
              accept="video/*" 
              onChange={handleFileChange} 
              className="hidden" 
              id="video-upload"
            />
            <label htmlFor="video-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-3">
                {selectedFile ? (
                  <>
                    <div className="badge badge-primary badge-lg">File Selected</div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
                
                <span className="text-lg font-medium">
                  {selectedFile ? selectedFile.name : "Drop video file here or click to browse"}
                </span>
                
                {selectedFile && (
                  <span className="text-sm opacity-70">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                )}
                
                {!selectedFile && (
                  <span className="text-sm opacity-70">
                    MP4, MOV, or AVI formats supported
                  </span>
                )}
              </div>
            </label>
          </div>
          
          {uploading && (
            <div className="mt-4">
              <div className="flex justify-between mb-1">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <progress 
                className="progress progress-primary w-full" 
                value={uploadProgress} 
                max="100"
              ></progress>
            </div>
          )}
          
          {error && (
            <div className="alert alert-error mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="btn btn-primary w-full mt-4"
          >
            {uploading ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Uploading...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                </svg>
                Upload Video
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoUploader;