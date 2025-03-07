import React, { useState, useEffect, useRef } from "react";
import { useToast } from "../../../hooks";
import { useState as useStateEffect } from 'react';
import { useVideos } from "../../../hooks";
import BoundingBoxEditor from "./BoundingBoxEditor";
import RallyControls from "./RallyControls";
import HittingMomentMarker from "./HittingMomentMarker";
import NetPositionMarker from "./NetPositionMarker";

interface RallyData {
  netPosition: { x: number, y: number } | null;
  rallies: {
    [rallyId: string]: {
      startFrame: number;
      endFrame: number;
      hittingMoments: {
        frameNumber: number;
        playerId: number;
        playerPosition: { x: number, y: number };
        boundingBoxes: any[];
      }[];
    };
  };
}

const RallyAnalysisView: React.FC = () => {
  const backendUrl = "http://localhost:5000";
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>("");
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentRallyId, setCurrentRallyId] = useState<string>("None");
  const [activeRally, setActiveRally] = useState<string | null>(null);
  const [isMarkingHitting, setIsMarkingHitting] = useState<boolean>(false);
  const [netPosition, setNetPosition] = useState<{ x: number, y: number } | null>(null);
  const [isSettingNet, setIsSettingNet] = useState<boolean>(false);
  const [rallyData, setRallyData] = useState<RallyData>({
    netPosition: null,
    rallies: {}
  });
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [imageSize, setImageSize] = useState<{ width: number, height: number }>({ width: 1280, height: 720 });
  const [showNetLines, setShowNetLines] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { showToast } = useToast();

  // Extract videoId from filename when video is selected
  useEffect(() => {
    if (selectedVideo) {
      const id = selectedVideo.split('.')[0];
      setVideoId(id);
      loadRallyData(id);
    }
  }, [selectedVideo]);

  // Fetch frames when video is selected
  useEffect(() => {
    if (videoId) {
      fetchFrames();
    }
  }, [videoId]);

  const loadRallyData = async (videoId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/annotation/get-rallies/${videoId}`);
      if (response.ok) {
        const data = await response.json();
        setRallyData(data);
        if (data.netPosition) {
          setNetPosition(data.netPosition);
        }
      } else {
        // Initialize empty rally data if none exists
        setRallyData({
          netPosition: null,
          rallies: {}
        });
      }
    } catch (error) {
      console.error("Failed to load rally data:", error);
      showToast("Failed to load existing rally data", "error");
    }
  };

  const fetchFrames = async () => {
    try {
      setIsLoading(true);
      // Use inference frames if available, otherwise use regular frames
      const endpoint = `${backendUrl}/api/inference/frames/${videoId}`;
      const response = await fetch(endpoint);
      
      if (response.ok) {
        const data = await response.json();
        const frameUrls = data.frames.map((frame: string) => 
          `${backendUrl}/api/inference/frame/${videoId}/${frame}`
        );
        setFrames(frameUrls);
        setCurrentFrameIndex(0);
        showToast(`Loaded ${frameUrls.length} frames`, "success");
      } else {
        throw new Error("Failed to fetch frames");
      }
    } catch (error) {
      console.error("Error fetching frames:", error);
      showToast("Failed to load video frames", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVideoSelection = (videoFileName: string) => {
    if (videoFileName !== selectedVideo) {
      setCurrentFrameIndex(0);
      setActiveRally(null);
      setCurrentRallyId("None");
      setSelectedVideo(videoFileName);
    }
  };

  const handleStartRally = () => {
    const newRallyId = Object.keys(rallyData.rallies).length + 1;
    setCurrentRallyId(newRallyId.toString());
    setActiveRally(newRallyId.toString());
    
    // Initialize new rally with current frame as start frame
    setRallyData(prev => ({
      ...prev,
      rallies: {
        ...prev.rallies,
        [newRallyId]: {
          startFrame: currentFrameIndex,
          endFrame: -1,
          hittingMoments: []
        }
      }
    }));
    
    showToast(`Created Rally #${newRallyId} starting at frame ${currentFrameIndex + 1}`, "info");
  };

  const handleSetRallyEndFrame = () => {
    if (!activeRally) {
      showToast("Please select or create a rally first", "warning");
      return;
    }
    
    setRallyData(prev => ({
      ...prev,
      rallies: {
        ...prev.rallies,
        [activeRally]: {
          ...prev.rallies[activeRally],
          endFrame: currentFrameIndex
        }
      }
    }));
    
    showToast(`Set end frame for Rally #${activeRally} at frame ${currentFrameIndex + 1}`, "success");
  };

  const handleToggleMarkHitting = () => {
    if (!activeRally) {
      showToast("Please select or create a rally first", "warning");
      return;
    }
    
    setIsMarkingHitting(!isMarkingHitting);
    if (!isMarkingHitting) {
      showToast("Click on a player to mark a hitting moment", "info");
    }
  };

  const handleMarkHittingMoment = (playerId: number, position: { x: number, y: number }, boundingBoxes: any[]) => {
    if (!activeRally) {
      showToast("Please select or create a rally first", "warning");
      return;
    }
    
    setRallyData(prev => {
      const updatedRallies = {...prev.rallies};
      const rally = updatedRallies[activeRally];
      
      // Check if we already have a hitting moment for this frame
      const existingIndex = rally.hittingMoments.findIndex(
        moment => moment.frameNumber === currentFrameIndex
      );
      
      if (existingIndex >= 0) {
        // Update existing hitting moment
        rally.hittingMoments[existingIndex] = {
          frameNumber: currentFrameIndex,
          playerId,
          playerPosition: position,
          boundingBoxes: boundingBoxes
        };
      } else {
        // Add new hitting moment
        rally.hittingMoments.push({
          frameNumber: currentFrameIndex,
          playerId,
          playerPosition: position,
          boundingBoxes: boundingBoxes
        });
      }
      
      return {
        ...prev,
        rallies: updatedRallies
      };
    });
    
    showToast(`Marked hitting moment for Player ${playerId} at frame ${currentFrameIndex + 1}`, "info");
    setIsMarkingHitting(false);
  };

  const handleSetNetPosition = (position: { x: number, y: number }) => {
    setNetPosition(position);
    setRallyData(prev => ({
      ...prev,
      netPosition: position
    }));
    setIsSettingNet(false);
    showToast(`Net position saved at X: ${Math.round(position.x)}, Y: ${Math.round(position.y)}`, "success");
  };

  const handleSaveRallyData = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`${backendUrl}/api/annotation/save-rallies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_id: videoId,
          data: rallyData
        }),
      });
      
      if (response.ok) {
        showToast("Rally data saved successfully", "success");
      } else {
        throw new Error("Failed to save rally data");
      }
    } catch (error) {
      console.error("Error saving rally data:", error);
      showToast("Failed to save rally data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviousFrame = () => {
    if (currentFrameIndex > 0) {
      setCurrentFrameIndex(prev => prev - 1);
    }
  };

  const handleNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex(prev => prev + 1);
    }
  };

  const handleJumpToFrame = (frameIndex: number) => {
    if (frameIndex >= 0 && frameIndex < frames.length) {
      setCurrentFrameIndex(frameIndex);
    }
  };

  // Check if current frame is marked as a hitting moment in the active rally
  const isCurrentFrameHittingMoment = () => {
    if (!activeRally) return false;
    
    const rally = rallyData.rallies[activeRally];
    if (!rally) return false;
    
    return rally.hittingMoments.some(moment => moment.frameNumber === currentFrameIndex);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Rally Analysis</h2>
        {isLoading && (
          <div className="flex items-center">
            <span className="loading loading-spinner loading-md mr-2"></span>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Video Selection */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title">Select Processed Video</h3>
          <VideoSelector onSelectVideo={handleVideoSelection} currentVideo={selectedVideo} />
        </div>
      </div>

      {selectedVideo && frames.length > 0 && (
        <>
          {/* Frame Display and Controls */}
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <div className="flex justify-between items-center">
                <h3 className="card-title">
                  Frame Analysis
                  <span className="badge badge-primary ml-2">
                    Frame {currentFrameIndex + 1} of {frames.length}
                  </span>
                  {activeRally && (
                    <span className="badge badge-secondary ml-2">
                      Rally #{activeRally}
                    </span>
                  )}
                </h3>
                
                <div className="flex gap-2">
                  <button 
                    className={`btn btn-sm ${isSettingNet ? 'btn-error' : 'btn-outline'}`}
                    onClick={() => setIsSettingNet(!isSettingNet)}
                  >
                    {isSettingNet ? 'Cancel' : 'Set Net Position'}
                  </button>
                  
                  {netPosition && (
                    <button 
                      className="btn btn-sm btn-outline"
                      onClick={() => setShowNetLines(!showNetLines)}
                    >
                      {showNetLines ? 'Hide Net Lines' : 'Show Net Lines'}
                    </button>
                  )}
                  
                  <button 
                    className={`btn btn-sm ${isEditing ? 'btn-error' : 'btn-outline'}`}
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? 'Done Editing' : 'Edit Bounding Boxes'}
                  </button>
                </div>
              </div>

              {/* Net position indicator */}
              {netPosition && !isSettingNet && !isEditing && (
                <div className="alert alert-info py-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Net position set at X: {Math.round(netPosition.x)}, Y: {Math.round(netPosition.y)}</span>
                </div>
              )}
              
              <div className="relative mt-2">
                {isSettingNet ? (
                  <div className="flex flex-col items-center justify-center w-full">
                    <div className="alert alert-info mb-4 w-full">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <span>Setting the net position helps establish court orientation for better analysis.</span>
                    </div>
                    <NetPositionMarker 
                      imageUrl={frames[currentFrameIndex]} 
                      onSetNetPosition={handleSetNetPosition}
                      initialPosition={netPosition}
                    />
                  </div>
                ) : isEditing ? (
                      <BoundingBoxEditor
                    imageUrl={frames[currentFrameIndex]}
                    videoId={videoId}
                    frameIndex={currentFrameIndex}
                    onSaveComplete={() => {
                      // Force reload frames to get updated poses
                      setIsLoading(true);
                      
                      // Display a message to the user about the processing
                      showToast("Processing changes and regenerating pose data...", "info");
                      
                      setTimeout(async () => {
                        try {
                          // First verify the pose coordinates file has been updated
                          try {
                            const poseResponse = await fetch(`${backendUrl}/api/annotation/get-pose-coordinates/${videoId}`);
                            if (!poseResponse.ok) {
                              console.warn("Pose coordinates may not have been updated properly");
                            } else {
                              console.log("Successfully fetched updated pose coordinates");
                            }
                          } catch (error) {
                            console.error("Error checking pose coordinates:", error);
                          }
                          
                          // Refetch the frames with updated data
                          const endpoint = `${backendUrl}/api/inference/frames/${videoId}`;
                          const response = await fetch(endpoint);
                          
                          if (response.ok) {
                            const data = await response.json();
                            
                            // Add cache-busting parameter to force reload of all frames
                            const timestamp = new Date().getTime();
                            const frameUrls = data.frames.map((frame: string) => 
                              `${backendUrl}/api/inference/frame/${videoId}/${frame}?t=${timestamp}`
                            );
                            
                            setFrames(frameUrls);
                            showToast("Frames refreshed with updated annotations", "success");
                          } else {
                            throw new Error("Failed to refresh frames");
                          }
                        } catch (error) {
                          console.error("Error refreshing frames:", error);
                          showToast("Failed to refresh frames with new annotations", "error");
                        } finally {
                          setIsLoading(false);
                          setIsEditing(false);
                        }
                      }, 5000); // Give backend more time to process (increased to 5 seconds)
                    }}
                  />
                ) : isMarkingHitting ? (
                  <HittingMomentMarker
                    imageUrl={frames[currentFrameIndex]}
                    videoId={videoId}
                    onMarkHittingMoment={handleMarkHittingMoment}
                  />
                ) : (
                  <div className="flex justify-center relative">
                    <img 
                      ref={imageRef}
                      src={frames[currentFrameIndex]} 
                      alt={`Frame ${currentFrameIndex}`}
                      className="max-w-full rounded-lg shadow-lg"
                      onLoad={() => {
                        // Update image size when the image loads
                        if (imageRef.current) {
                          const img = imageRef.current;
                          // Get the natural image dimensions
                          const naturalWidth = img.naturalWidth;
                          const naturalHeight = img.naturalHeight;
                          setImageSize({ width: naturalWidth, height: naturalHeight });
                        }
                      }}
                    />
                    
                    {/* Net position indicator - only show if showNetLines is true */}
                    {netPosition && showNetLines && (
                      <>
                        {/* Calculate scaled positions based on the actual displayed image size */}
                        <div 
                          className="absolute w-full h-1 bg-red-500 opacity-70"
                          style={{ 
                            top: `${(netPosition.y / imageSize.height) * 100}%`,
                            left: 0
                          }}
                        ></div>
                        {/* Vertical line at net X position */}
                        <div 
                          className="absolute w-1 bg-blue-500 opacity-70"
                          style={{ 
                            left: `${(netPosition.x / imageSize.width) * 100}%`,
                            top: 0,
                            bottom: 0,
                            height: '100%'
                          }}
                        ></div>
                      </>
                    )}
                    
                    {/* Hitting moment indicator */}
                    {isCurrentFrameHittingMoment() && (
                      <div className="absolute top-2 right-2 bg-success text-white p-2 rounded shadow-lg">
                        Hitting Moment
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Rally Controls */}
              <div className="flex flex-col gap-4 mt-4">
                {/* Rally management buttons */}
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-success"
                      onClick={handleStartRally}
                      disabled={isSettingNet || isEditing}
                    >
                      Create New Rally
                    </button>
                    
                    {activeRally && (
                      <>
                        <button 
                          className="btn btn-primary"
                          onClick={handleSetRallyEndFrame}
                          disabled={isSettingNet || isEditing}
                        >
                          Set End Frame
                        </button>
                        
                        <button 
                          className={`btn ${isMarkingHitting ? 'btn-error' : 'btn-accent'}`}
                          onClick={handleToggleMarkHitting}
                          disabled={isSettingNet || isEditing}
                        >
                          {isMarkingHitting ? 'Cancel' : 'Mark Hitting Moment'}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveRallyData}
                    disabled={isSettingNet || isEditing}
                  >
                    Save All Rally Data
                  </button>
                </div>
                
                {/* Frame Navigation */}
                <div className="flex justify-between gap-2">
                  <button
                    className="btn btn-sm"
                    onClick={handlePreviousFrame}
                    disabled={isSettingNet || isEditing || currentFrameIndex === 0}
                  >
                    ◀️ Previous
                  </button>
                  
                  <button
                    className="btn btn-sm"
                    onClick={handleNextFrame}
                    disabled={isSettingNet || isEditing || currentFrameIndex === frames.length - 1}
                  >
                    Next ▶️
                  </button>
                </div>
                
                {/* Frame Slider */}
                <div className="flex items-center gap-4">
                  <span className="w-16 text-right">{currentFrameIndex + 1}</span>
                  <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={currentFrameIndex}
                    onChange={(e) => handleJumpToFrame(parseInt(e.target.value))}
                    disabled={isSettingNet || isEditing}
                    className="range range-primary flex-grow"
                  />
                  <span className="w-16">{frames.length}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Rally Information */}
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <h3 className="card-title">Rally Information</h3>
              
              {Object.keys(rallyData.rallies).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Rally #</th>
                        <th>Start Frame</th>
                        <th>End Frame</th>
                        <th>Hitting Moments</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(rallyData.rallies).map(([rallyId, rally]) => (
                        <tr key={rallyId} className={activeRally === rallyId ? "bg-base-300" : ""}>
                          <td>{rallyId}</td>
                          <td>
                            <button 
                              className="btn btn-xs"
                              onClick={() => handleJumpToFrame(rally.startFrame)}
                            >
                              {rally.startFrame + 1}
                            </button>
                          </td>
                          <td>
                            {rally.endFrame >= 0 ? (
                              <button 
                                className="btn btn-xs"
                                onClick={() => handleJumpToFrame(rally.endFrame)}
                              >
                                {rally.endFrame + 1}
                              </button>
                            ) : (
                              "Not set"
                            )}
                          </td>
                          <td>{rally.hittingMoments.length}</td>
                          <td>
                            <div className="flex gap-1">
                              <button 
                                className={`btn btn-xs ${activeRally === rallyId ? 'btn-success' : 'btn-outline'}`}
                                onClick={() => {
                                  setActiveRally(rallyId);
                                  setCurrentRallyId(rallyId);
                                  handleJumpToFrame(rally.startFrame);
                                }}
                              >
                                {activeRally === rallyId ? 'Selected' : 'Select'}
                              </button>
                              <button 
                                className="btn btn-xs btn-error"
                                onClick={() => {
                                  // Remove this rally
                                  setRallyData(prev => {
                                    const updatedRallies = {...prev.rallies};
                                    delete updatedRallies[rallyId];
                                    return {
                                      ...prev,
                                      rallies: updatedRallies
                                    };
                                  });
                                  
                                  if (activeRally === rallyId) {
                                    setActiveRally(null);
                                    setCurrentRallyId("None");
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="alert alert-info">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>No rallies have been marked yet. Click "Create New Rally" to begin analyzing a rally.</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Help Section */}
          <div className="collapse collapse-arrow bg-base-100 shadow-lg">
            <input type="checkbox" /> 
            <div className="collapse-title font-medium">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Rally Analysis Instructions
              </div>
            </div>
            <div className="collapse-content"> 
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Getting Started</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Select a video that has been processed with inference</li>
                    <li>Set the net position using the "Set Net Position" button</li>
                    <li>Navigate to the beginning of a rally and click "Create New Rally"</li>
                    <li>Browse to moments where players hit the ball</li>
                    <li>Click "Mark Hitting Moment" then select the player who is hitting the ball</li>
                    <li>Navigate to the end of the rally and click "Set End Frame"</li>
                    <li>Save your rally data when finished</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Tips & Features</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>The net position is shown with red (horizontal) and blue (vertical) lines</li>
                    <li>You can toggle the visibility of net lines using the "Hide Net Lines" button</li>
                    <li>Edit bounding boxes if needed for better player detection</li>
                    <li>You can create multiple rallies in the same video</li>
                    <li>Select a rally from the table to continue working on it</li>
                    <li>Jump directly to specific frames using the slider</li>
                    <li>Click on frame numbers in the rally table to navigate quickly</li>
                    <li>Each rally tracks start/end frames and hitting moments</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {selectedVideo && frames.length === 0 && !isLoading && (
        <div className="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-bold">No frames available!</h3>
            <div className="text-sm">This video needs to be processed with inference before rally analysis. Please go to the Training tab first.</div>
          </div>
        </div>
      )}
      
      {!selectedVideo && (
        <div className="card bg-base-100 shadow-lg p-8">
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-primary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold mb-2">Select a Video to Begin</h3>
            <p className="text-base-content/70 mb-6">
              Please select a processed video from the dropdown to start analyzing tennis rallies.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple video selector component
interface VideoSelectorProps {
  onSelectVideo: (videoFileName: string) => void;
  currentVideo: string | null;
}

const VideoSelector: React.FC<VideoSelectorProps> = ({ onSelectVideo, currentVideo }) => {
  const { videos, loading } = useVideos();
  const [filteredVideos, setFilteredVideos] = useStateEffect<string[]>([]);
  
  useEffect(() => {
    // Filter videos to only show ones that have been processed with inference
    const checkProcessedVideos = async () => {
      const processed = [];
      for (const video of videos) {
        try {
          const response = await fetch(`http://localhost:5000/api/inference/check-readiness/${video.split('.')[0]}`);
          if (response.ok) {
            const data = await response.json();
            if (data.ready) {
              processed.push(video);
            }
          }
        } catch (error) {
          console.error(`Error checking video ${video}:`, error);
        }
      }
      setFilteredVideos(processed);
    };
    
    checkProcessedVideos();
  }, [videos]);
  
  return (
    <div className="form-control w-full">
      <div className="flex items-center gap-2">
        <select
          className="select select-bordered w-full"
          value={currentVideo || ""}
          onChange={(e) => onSelectVideo(e.target.value)}
          disabled={loading}
        >
          <option value="">-- Select a processed video --</option>
          {filteredVideos.map((video) => (
            <option key={video} value={video}>
              {video}
            </option>
          ))}
        </select>
        
        {loading && <span className="loading loading-spinner loading-sm"></span>}
      </div>
      
      {filteredVideos.length === 0 && !loading && (
        <div className="alert alert-warning mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 h-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>No processed videos found. Please complete training and inference first.</span>
        </div>
      )}
    </div>
  );
};

export default RallyAnalysisView