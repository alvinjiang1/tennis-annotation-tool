import React, { useState, useEffect } from 'react';
import VideoUploader from '../video/VideoUploader';
import { useToast } from '../../../hooks';
import PlayerDescriptionForm from './PlayerDescriptionForm';
import FrameNavigator from './FrameNavigator';
import BoundingBoxAnnotator from './BoundingBoxAnnotator';
import PlayerDescriptionDisplay from './PlayerDescriptionDisplay';

const AnnotationView = () => {
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>('');
  const [isFrameExtractionComplete, setIsFrameExtractionComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [playerDescriptionsComplete, setPlayerDescriptionsComplete] = useState(false);
  const [isEditingPlayerDescriptions, setIsEditingPlayerDescriptions] = useState(false);
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
        try {
          const categoriesResponse = await fetch(`http://localhost:5000/api/annotation/get/${id}`);
          
          if (categoriesResponse.ok) {
            const categoryData = await categoriesResponse.json();
            if (categoryData.categories && categoryData.categories.length > 0 &&
                categoryData.categories.every((cat: any) => cat.name && cat.name.trim() !== '')) {
              setPlayerDescriptionsComplete(true);
            } else {
              // Categories exist but are incomplete or empty
              setPlayerDescriptionsComplete(false);
            }
          } else {
            // Annotation file doesn't exist yet - not an error, just need to create it
            console.log('No annotation file exists yet - will create one when saving player descriptions');
            setPlayerDescriptionsComplete(false);
          }
        } catch (error) {
          // If there's an error, treat it as annotations don't exist yet
          console.log('Error checking player descriptions, will initialize them:', error);
          setPlayerDescriptionsComplete(false);
        }
      } else {
        // Frames don't exist yet
        setIsFrameExtractionComplete(false);
        setPlayerDescriptionsComplete(false);
        showToast('Waiting for frames to be extracted...', 'info');
      }
    } catch (error) {
      console.error('Error handling video selection:', error);
      showToast('Error processing video', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerDescriptionsComplete = () => {
    setPlayerDescriptionsComplete(true);
    setIsEditingPlayerDescriptions(false);
    showToast('Player descriptions saved. Now you can annotate each frame.', 'success');
  };
  
  const handleAnnotationComplete = () => {
    fetchVideoFrames(); // Refresh frames to show updated annotations
  };
  
  const handleToggleAnnotation = () => {
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
      if (isAnnotating) setIsAnnotating(false);
    }
  };
  
  const handleNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex(currentFrameIndex + 1);
      if (isAnnotating) setIsAnnotating(false);
    }
  };
  
  const handleFrameSliderChange = (index: number) => {
    setCurrentFrameIndex(index);
    if (isAnnotating) setIsAnnotating(false);
  };

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="alert alert-info">
          <div className="flex items-center">
            <span className="loading loading-spinner loading-sm mr-2"></span>
            <span>Processing... Please wait.</span>
          </div>
        </div>
      )}
      
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
      
      {uploadedVideo && isFrameExtractionComplete && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex justify-between items-center">
              <h2 className="card-title">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {isEditingPlayerDescriptions 
                  ? "Edit Player Descriptions" 
                  : (!playerDescriptionsComplete ? "Define Player Descriptions" : "Tennis Player Annotation")}
              </h2>
            </div>
            
            {/* Always show PlayerDescriptionForm for new videos or when editing */}
            {frames.length > 0 ? (
              <div className="flex flex-col space-y-6">
                {/* Top section - large frame */}
                <div className="space-y-4">
                  <div className="relative">
                    {isAnnotating ? (
                      <BoundingBoxAnnotator 
                        imageUrl={frames[currentFrameIndex]}
                        videoId={videoId}
                        isAnnotating={isAnnotating}
                        setIsAnnotating={setIsAnnotating}
                        onSaveComplete={handleAnnotationComplete}
                      />
                    ) : (
                      <div className="flex justify-center">
                        <img 
                          src={frames[currentFrameIndex]} 
                          alt={`Frame ${currentFrameIndex}`}
                          className="max-w-full rounded-lg shadow-lg"
                        />
                      </div>
                    )}
                  </div>
                  
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
                </div>
                
                {/* Bottom section - player descriptions or annotation instructions */}
                <div className="card bg-base-200 p-6">
                  {!playerDescriptionsComplete || isEditingPlayerDescriptions ? (
                    <>
                      <h3 className="font-medium text-lg mb-4">Player Descriptions</h3>
                      <div className="alert alert-info mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span>Look at the frames using the navigation controls to identify players, then describe each player here.</span>
                      </div>
                      <PlayerDescriptionForm 
                        videoId={videoId} 
                        onComplete={handlePlayerDescriptionsComplete}
                        editMode={isEditingPlayerDescriptions}
                      />
                    </>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-medium text-lg mb-4">Annotation Instructions</h3>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>Navigate to a frame you want to annotate</li>
                          <li>Click "Start Annotating" to begin drawing boxes</li>
                          <li>Select a player from the list above the canvas</li>
                          <li>Draw bounding boxes around each player</li>
                          <li>Save your annotations when complete</li>
                          <li>Continue to the next frame</li>
                        </ol>
                      </div>
                      
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-medium text-lg">Current Player Descriptions</h3>
                          <button
                            onClick={handleEditPlayerDescriptions}
                            className="btn btn-sm btn-outline"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4 mr-1">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Edit Descriptions
                          </button>
                        </div>
                        <PlayerDescriptionDisplay videoId={videoId} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="alert alert-warning">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>No frames available. Please check if the video has been processed correctly.</span>
              </div>
            )}
          </div>
        </div>
      )}
      
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
              <li className="step">Enter player descriptions (required before annotation)</li>
              <li className="step">Browse frames to annotate</li>
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