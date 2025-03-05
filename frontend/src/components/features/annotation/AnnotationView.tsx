import React, { useState, useEffect } from 'react';
import VideoUploader from '../video/VideoUploader';
import { useToast } from '../../../hooks';
import PlayerDescriptionForm from './PlayerDescriptionForm';
import FrameNavigator from './FrameNavigator';
import BoundingBoxAnnotator from './BoundingBoxAnnotator';

const AnnotationView = () => {
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>('');
  const [isFrameExtractionComplete, setIsFrameExtractionComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [playerDescriptionsComplete, setPlayerDescriptionsComplete] = useState(false);
  const [isEditingPlayerDescriptions, setIsEditingPlayerDescriptions] = useState(false); // New state for editing mode
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const { showToast } = useToast();
  
  // Extract video ID from filename
  useEffect(() => {
    if (uploadedVideo) {
      const id = uploadedVideo.split('.')[0];
      setVideoId(id);
    }
  }, [uploadedVideo]);
  
  // Load frames when video is selected and frame extraction is complete
  useEffect(() => {
    if (videoId && isFrameExtractionComplete) {
      fetchVideoFrames();
    }
  }, [videoId, isFrameExtractionComplete]);
  
  const fetchVideoFrames = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:5000/api/video/frames/${videoId}`);
      const data = await response.json();
      
      if (response.ok && data.frames && data.frames.length > 0) {
        const frameUrls = data.frames.map((frame: string) => 
          `http://localhost:5000/api/video/frame/${videoId}/${frame}`
        );
        setFrames(frameUrls);
        showToast(`Loaded ${frameUrls.length} frames`, 'success');
      } else {
        showToast('No frames found for this video', 'error');
      }
    } catch (error) {
      console.error('Error fetching frames:', error);
      showToast('Failed to load video frames', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleVideoSelection = async (videoFileName: string) => {
    try {
      setIsLoading(true);
      setUploadedVideo(videoFileName);
      
      // Extract video ID from filename
      const id = videoFileName.split('.')[0];
      setVideoId(id);
      
      // Check if frames already exist
      const response = await fetch(`http://localhost:5000/api/video/frames/${id}`);
      const data = await response.json();
      
      if (response.ok && data.frames && data.frames.length > 0) {
        setIsFrameExtractionComplete(true);
        
        // Check if player descriptions are already set for this video
        const categoriesResponse = await fetch(`http://localhost:5000/api/annotation/get/${id}`);
        if (categoriesResponse.ok) {
          const categoryData = await categoriesResponse.json();
          if (categoryData.categories && categoryData.categories.length === 4) {
            setPlayerDescriptionsComplete(true);
          } else {
            setPlayerDescriptionsComplete(false);
          }
        }
      } else {
        setIsFrameExtractionComplete(false);
        showToast('Frames need to be extracted for this video', 'info');
        
        // Trigger frame extraction
        await extractFrames(videoFileName);
      }
    } catch (error) {
      console.error('Error handling video selection:', error);
      showToast('Error processing video', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const extractFrames = async (videoFileName: string) => {
    try {
      showToast('Extracting frames...', 'info');
      
      const response = await fetch(`http://localhost:5000/api/video/extract-frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: videoFileName })
      });
      
      if (response.ok) {
        setIsFrameExtractionComplete(true);
        showToast('Frame extraction complete!', 'success');
      } else {
        throw new Error('Frame extraction failed');
      }
    } catch (error) {
      console.error('Error extracting frames:', error);
      showToast('Failed to extract frames', 'error');
    }
  };

  const handlePlayerDescriptionsComplete = () => {
    setPlayerDescriptionsComplete(true);
    setIsEditingPlayerDescriptions(false); // Exit edit mode if active
    showToast('Player descriptions saved. Now you can annotate each frame.', 'success');
  };
  
  const handleAnnotationComplete = () => {
    fetchVideoFrames(); // Refresh frames to show updated annotations
  };
  
  const handleToggleAnnotation = () => {
    // Only allow annotation if player descriptions are complete
    if (!playerDescriptionsComplete) {
      showToast('Please complete player descriptions first', 'warning');
      return;
    }
    
    setIsAnnotating(!isAnnotating);
  };
  
  const handleEditPlayerDescriptions = () => {
    setIsEditingPlayerDescriptions(true);
  };
  
  const handlePreviousFrame = () => {
    if (currentFrameIndex > 0) {
      setCurrentFrameIndex(currentFrameIndex - 1);
      if (isAnnotating) setIsAnnotating(false); // Exit annotation mode when changing frames
    }
  };
  
  const handleNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex(currentFrameIndex + 1);
      if (isAnnotating) setIsAnnotating(false); // Exit annotation mode when changing frames
    }
  };
  
  const handleFrameSliderChange = (index: number) => {
    setCurrentFrameIndex(index);
    if (isAnnotating) setIsAnnotating(false); // Exit annotation mode when changing frames
  };

  return (
    <div className="space-y-6">
      {/* Status indicator */}
      {isLoading && (
        <div className="alert alert-info">
          <div className="flex items-center">
            <span className="loading loading-spinner loading-sm mr-2"></span>
            <span>Processing... Please wait.</span>
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
            onUploadSuccess={handleVideoSelection} 
          />
        </div>
      </div>
      
      {/* Frame display and annotation section - shown after frames are loaded */}
      {uploadedVideo && isFrameExtractionComplete && frames.length > 0 && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex justify-between items-center">
              <h2 className="card-title">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {isEditingPlayerDescriptions 
                  ? "Edit Player Descriptions" 
                  : (playerDescriptionsComplete ? "Tennis Player Annotation" : "Define Player Descriptions")}
              </h2>
              
              {/* New: Edit button when descriptions are complete and not currently editing */}
              {playerDescriptionsComplete && !isEditingPlayerDescriptions && !isAnnotating && (
                <button 
                  onClick={handleEditPlayerDescriptions}
                  className="btn btn-outline btn-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit Player Descriptions
                </button>
              )}
            </div>
            
            {/* Show player descriptions form when editing or when descriptions are not yet complete */}
            {(isEditingPlayerDescriptions || !playerDescriptionsComplete) ? (
              <PlayerDescriptionForm 
                videoId={videoId} 
                onComplete={handlePlayerDescriptionsComplete}
                editMode={isEditingPlayerDescriptions} // Pass edit mode flag
              />
            ) : (
              <>
                {/* Frame display section */}
                <div className="relative">
                  {isAnnotating ? (
                    // Show annotation interface when in annotation mode
                    <BoundingBoxAnnotator 
                      imageUrl={frames[currentFrameIndex]}
                      videoId={videoId}
                      isAnnotating={isAnnotating}
                      setIsAnnotating={setIsAnnotating}
                      onSaveComplete={handleAnnotationComplete}
                    />
                  ) : (
                    // Show just the frame otherwise
                    <div className="flex justify-center">
                      <img 
                        src={frames[currentFrameIndex]} 
                        alt={`Frame ${currentFrameIndex}`}
                        className="max-w-full rounded-lg shadow-lg"
                      />
                    </div>
                  )}
                </div>
                
                {/* Frame navigation */}
                <FrameNavigator
                  currentIndex={currentFrameIndex}
                  totalFrames={frames.length}
                  isAnnotating={isAnnotating}
                  onPrevious={handlePreviousFrame}
                  onNext={handleNextFrame}
                  onToggleAnnotation={handleToggleAnnotation}
                  onSliderChange={handleFrameSliderChange}
                  disableAnnotation={!playerDescriptionsComplete}
                />
              </>
            )}
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
              <li className="step">Browse frames and identify players</li>
              <li className="step">Enter player descriptions (one time per video)</li>
              <li className="step">Click "Start Annotating" on each frame</li>
              <li className="step">Draw bounding boxes around players</li>
              <li className="step">Save annotations for each frame</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationView;