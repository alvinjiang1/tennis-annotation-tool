import React, { useState, useEffect } from 'react';
import VideoUploader from '../video/VideoUploader';
import FrameDisplay from '../frame/FrameDisplay';
import { useToast } from '../../../hooks';

const AnnotationView = () => {
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [isFrameExtractionComplete, setIsFrameExtractionComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();
  
  // Reset frame extraction status when video changes
  useEffect(() => {
    setIsFrameExtractionComplete(false);
  }, [uploadedVideo]);
  
  const handleVideoSelection = async (videoFileName: string) => {
    try {
      setIsLoading(true);
      setUploadedVideo(videoFileName);
      
      // Check if frames are already extracted
      const response = await fetch(`http://localhost:5000/api/video/frames?filename=${videoFileName}`);
      const data = await response.json();
      
      if (response.ok && data.frames && data.frames.length > 0) {
        setIsFrameExtractionComplete(true);
      } else {
        // Extract frames if not already done
        const extractResponse = await fetch(`http://localhost:5000/api/video/extract-frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: videoFileName })
        });
        
        if (extractResponse.ok) {
          setIsFrameExtractionComplete(true);
          showToast('Frames extracted successfully!', 'success');
        } else {
          throw new Error('Failed to extract frames');
        }
      }
    } catch (error) {
      console.error('Error handling video selection:', error);
      showToast('Error processing video. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleUploadSuccess = async (videoFileName: string) => {
    try {
      setIsLoading(true);
      showToast('Video uploaded successfully! Extracting frames...', 'info');
      
      // Trigger frame extraction after upload
      const extractResponse = await fetch(`http://localhost:5000/api/video/extract-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: videoFileName })
      });
      
      if (extractResponse.ok) {
        setUploadedVideo(videoFileName);
        setIsFrameExtractionComplete(true);
        showToast('Frames extracted successfully!', 'success');
      } else {
        throw new Error('Failed to extract frames');
      }
    } catch (error) {
      console.error('Error extracting frames:', error);
      showToast('Error extracting frames. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status indicator */}
      {isLoading && (
        <div className="alert alert-info">
          <div className="flex items-center">
            <span className="loading loading-spinner loading-sm mr-2"></span>
            <span>Processing video... Please wait.</span>
          </div>
        </div>
      )}
      
      {/* Video uploader section */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h18M3 16h18" />
            </svg>
            Select or Upload a Tennis Video
          </h2>
          <VideoUploader 
            onSelectVideo={handleVideoSelection} 
            onUploadSuccess={handleUploadSuccess} 
          />
        </div>
      </div>
      
      {/* Frame display section */}
      {uploadedVideo && isFrameExtractionComplete && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Tennis Player Annotation
            </h2>
            <p className="text-sm text-base-content/70 mb-4">
              Draw bounding boxes around the four tennis players across frames. 
              Start by entering player descriptions, then select a player label and draw boxes.
            </p>
            <FrameDisplay 
              videoFilename={uploadedVideo} 
              labelShots={false}
            />
          </div>
        </div>
      )}
      
      {/* Instructions when no video is selected */}
      {!uploadedVideo && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-primary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h2 className="card-title">Getting Started</h2>
            <p>Upload a tennis video or select a previously uploaded video to begin annotation.</p>
            <ul className="steps steps-vertical mt-4">
              <li className="step step-primary">Upload or select a tennis video</li>
              <li className="step">Wait for frame extraction</li>
              <li className="step">Enter player descriptions</li>
              <li className="step">Annotate players across frames</li>
              <li className="step">Save your annotations</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationView;