import React, { useState, useEffect } from 'react';
import { useToast, useVideos } from '../../../hooks';
import LabelEditor from './LabelEditor';

interface ShotLabel {
  player: string;
  frame: number;
  label: string;
  outcome: string;
  handedness?: string;
}

interface Rally {
  player_descriptons: any;
  events: ShotLabel[];
}

interface LabelData {
  video_id: string;
  rallies: Rally[];
}

const ShotLabelingView: React.FC = () => {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string>('');
  const [labelData, setLabelData] = useState<LabelData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedRally, setSelectedRally] = useState<number>(0);
  const [selectedEvent, setSelectedEvent] = useState<number>(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<string>('');
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const { showToast } = useToast();
  const backendUrl = 'http://localhost:5000';
  
  // Handle video selection
  const handleVideoSelection = (videoFileName: string) => {
    if (videoFileName !== selectedVideo) {
      setSelectedVideo(videoFileName);
      const id = videoFileName.split('.')[0];
      setVideoId(id);
      
      // Reset selected rally and event
      setSelectedRally(0);
      setSelectedEvent(0);
      
      // Check and load label file
      checkLabelFile(id);
    }
  };
  
  // Check if label file exists
  const checkLabelFile = async (id: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${backendUrl}/api/label/check/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.exists) {
          loadLabelData(id);
        } else {
          showToast('No shot labels found for this video. Please generate labels first.', 'warning');
        }
      } else {
        showToast('Failed to check label file', 'error');
      }
    } catch (error) {
      console.error('Error checking label file:', error);
      showToast('Error checking label file', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load label data
  const loadLabelData = async (id: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${backendUrl}/api/label/get/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        setLabelData(data.data);
        setDataSource(data.source);
        // Load frames for the first rally and event
        loadFrames(id);
      } else {
        showToast('Failed to load label data', 'error');
      }
    } catch (error) {
      console.error('Error loading label data:', error);
      showToast('Error loading label data', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load frames for the selected video
  const loadFrames = async (id: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/inference/frames/${id}`);
      
      if (response.ok) {
        const data = await response.json();
        const frameUrls = data.frames.map((frame: string) => 
          `${backendUrl}/api/inference/frame/${id}/${frame}`
        );
        setFrames(frameUrls);
      } else {
        showToast('Failed to load frames', 'error');
      }
    } catch (error) {
      console.error('Error loading frames:', error);
      showToast('Error loading frames', 'error');
    }
  };
  
  // Handle label update
  const handleUpdateLabel = async (updatedEvent: ShotLabel) => {
    if (!labelData || !videoId) return;
    
    try {
      setIsLoading(true);
      
      const response = await fetch(`${backendUrl}/api/label/update/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rallyIndex: selectedRally,
          eventIndex: selectedEvent,
          updatedEvent: updatedEvent
        }),
      });
      
      if (response.ok) {
        // Update local state
        const updatedLabelData = { ...labelData };
        updatedLabelData.rallies[selectedRally].events[selectedEvent] = updatedEvent;
        setLabelData(updatedLabelData);
        setDataSource('confirmed'); // Now using confirmed data
        
        showToast('Label updated successfully', 'success');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update label');
      }
    } catch (error) {
      console.error('Error updating label:', error);
      showToast('Failed to update label', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle confirmation of labels
  const handleConfirmLabels = async () => {
    if (!videoId) return;
    
    try {
      setIsConfirming(true);
      
      const response = await fetch(`${backendUrl}/api/label/confirm/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        setDataSource('confirmed');
        showToast('Labels confirmed and saved to confirmed_labels directory', 'success');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm labels');
      }
    } catch (error) {
      console.error('Error confirming labels:', error);
      showToast('Failed to confirm labels', 'error');
    } finally {
      setIsConfirming(false);
    }
  };
  
  // Get current frame to display based on selected event
  const getCurrentFrameUrl = () => {
    if (!labelData || selectedRally >= labelData.rallies.length) return '';
    
    const rally = labelData.rallies[selectedRally];
    if (!rally || selectedEvent >= rally.events.length) return '';
    
    const event = rally.events[selectedEvent];
    const frameIndex = event.frame;
    
    // Find the frame that matches this frame number
    return frames.find(url => {
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const fileFrameNum = parseInt(fileName.split('_')[0]);
      return fileFrameNum === frameIndex;
    }) || '';
  };

  // Get the frame index in the frames array for the current shot
  const getCurrentFrameIndex = () => {
    if (!labelData || selectedRally >= labelData.rallies.length) return 0;
    
    const rally = labelData.rallies[selectedRally];
    if (!rally || selectedEvent >= rally.events.length) return 0;
    
    const event = rally.events[selectedEvent];
    const frameNumber = event.frame;
    
    // Find the index of the frame that matches this frame number
    return frames.findIndex(url => {
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const fileFrameNum = parseInt(fileName.split('_')[0]);
      return fileFrameNum === frameNumber;
    });
  };
  
  // Get player name from player ID
  const getPlayerName = (playerId: string) => {
    if (labelData && 
        labelData.rallies && 
        labelData.rallies[selectedRally] && 
        labelData.rallies[selectedRally].player_descriptons && 
        labelData.rallies[selectedRally].player_descriptons.descriptions && 
        labelData.rallies[selectedRally].player_descriptons.descriptions[playerId]) {
      return labelData.rallies[selectedRally].player_descriptons.descriptions[playerId];
    }
    return playerId;
  };
  
  // Get player handedness
  const getPlayerHandedness = (playerId: string) => {
    if (labelData && 
        labelData.rallies && 
        labelData.rallies[selectedRally] && 
        labelData.rallies[selectedRally].player_descriptons && 
        labelData.rallies[selectedRally].player_descriptons.handedness && 
        labelData.rallies[selectedRally].player_descriptons.handedness[playerId]) {
      return labelData.rallies[selectedRally].player_descriptons.handedness[playerId];
    }
    return "unknown";
  };
  
  // Helper function to get handedness icon
  const getHandednessIcon = (handedness: string) => {
    switch(handedness) {
      case 'right': return '👉';
      case 'left': return '👈';
      default: return '❓';
    }
  };
  
  // Helper function to get player emoji
  const getPlayerEmoji = (playerId: string) => {
    // Convert player ID to a number for consistent emoji mapping
    const playerNum = playerId.replace('p', '');
    const playerEmojis = ['🎾', '🏸', '🏓', '🎯'];
    return playerEmojis[parseInt(playerNum) - 1] || '👤';
  };
  
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Shot Label Editor</h2>
        {isLoading && (
          <div className="flex items-center bg-base-200 px-3 py-1 rounded-lg shadow-sm">
            <span className="loading loading-spinner loading-sm mr-2 text-primary"></span>
            <span className="text-sm">Processing...</span>
          </div>
        )}
      </div>
      
      {/* Video Selection Card */}
      <div className="card bg-base-100 shadow-lg border border-base-300">
        <div className="card-body p-4">
          <h3 className="card-title text-base mb-2 pb-2 border-b border-base-200">Select Video</h3>
          <VideoSelector onSelectVideo={handleVideoSelection} currentVideo={selectedVideo} />
          
          {/* Data source indicator & confirmation button */}
          {labelData && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-4 pt-3 border-t border-base-200">
              <div className="flex items-center">
                <span className="mr-2 text-sm">Source:</span>
                <div className={`badge ${dataSource === 'confirmed' ? 'badge-success' : 'badge-warning'} badge-sm py-2`}>
                  {dataSource === 'confirmed' ? 'Confirmed Labels' : 'Generated Labels'}
                </div>
              </div>
              
              {dataSource === 'generated' && (
                <button
                  className="btn btn-success btn-sm w-full md:w-auto"
                  onClick={handleConfirmLabels}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      Confirming...
                    </>
                  ) : 'Confirm All Labels'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {labelData && labelData.rallies.length > 0 && (
        <>
          {/* Rally & Event Selection */}
          <div className="card bg-base-100 shadow-lg border border-base-300">
            <div className="card-body p-4">
              <div className="flex flex-col lg:flex-row lg:justify-between gap-4">
                {/* Rally Selection */}
                <div className="flex-1">
                  <h3 className="text-base font-bold mb-2 pb-1 border-b border-base-200">
                    <span className="inline-block mr-2">🎾</span>
                    Select Rally
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                    {labelData.rallies.map((rally, index) => (
                      <button
                        key={index}
                        className={`btn btn-sm ${selectedRally === index 
                          ? 'btn-primary shadow-sm' 
                          : 'btn-outline'}`}
                        onClick={() => {
                          setSelectedRally(index);
                          setSelectedEvent(0); // Reset to first event in the rally
                        }}
                      >
                        #{index + 1}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Event Selection */}
                {labelData.rallies[selectedRally] && (
                  <div className="flex-1">
                    <h3 className="text-base font-bold mb-2 pb-1 border-b border-base-200">
                      <span className="inline-block mr-2">🏸</span>
                      Select Shot
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {labelData.rallies[selectedRally].events.map((event, index) => (
                        <button
                          key={index}
                          className={`btn btn-sm ${
                            selectedEvent === index 
                              ? 'btn-secondary shadow-sm' 
                              : event.outcome === 'err' 
                                ? 'btn-outline border-error text-error' 
                                : event.outcome === 'win' 
                                  ? 'btn-outline border-success text-success' 
                                  : 'btn-outline'
                          }`}
                          onClick={() => setSelectedEvent(index)}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span className="text-xs">{index + 1}</span>
                            <span className="text-xs">{event.player}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Shot Details and Label Editor */}
          {labelData.rallies[selectedRally] && 
           labelData.rallies[selectedRally].events[selectedEvent] && (
             <div className="card bg-base-100 shadow-lg border border-base-300">
               <div className="card-body p-4">
                 {/* Player Information Card */}
                 <div className="flex items-center justify-between mb-3 pb-2 border-b border-base-200">
                   <h3 className="text-base font-bold">Shot Details</h3>
                 </div>
                 
                 <div className="mb-4">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                     {/* Player */}
                     <div className="flex items-center gap-2 bg-base-200 p-2 rounded">
                       <div className="text-lg">{getPlayerEmoji(labelData.rallies[selectedRally].events[selectedEvent].player)}</div>
                       <div>
                         <div className="text-xs opacity-70">Player</div>
                         <div className="text-sm font-medium">{getPlayerName(labelData.rallies[selectedRally].events[selectedEvent].player)}</div>
                       </div>
                     </div>
                     
                     {/* Handedness */}
                     <div className="flex items-center gap-2 bg-base-200 p-2 rounded">
                       <div className="text-lg">{getHandednessIcon(labelData.rallies[selectedRally].events[selectedEvent].handedness || getPlayerHandedness(labelData.rallies[selectedRally].events[selectedEvent].player))}</div>
                       <div>
                         <div className="text-xs opacity-70">Handedness</div>
                         <div className="text-sm font-medium capitalize">{labelData.rallies[selectedRally].events[selectedEvent].handedness || getPlayerHandedness(labelData.rallies[selectedRally].events[selectedEvent].player)}</div>
                       </div>
                     </div>
                     
                     {/* Full Label */}
                     <div className="flex items-center gap-2 bg-base-200 p-2 rounded">
                       <div className="text-lg">🏷️</div>
                       <div className="w-full">
                         <div className="text-xs opacity-70">Full Label</div>
                         <div className="text-sm font-medium font-mono break-all">
                           {labelData.rallies[selectedRally].events[selectedEvent].label}
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
                 
                 <LabelEditor
                   frameUrl={getCurrentFrameUrl()}
                   label={labelData.rallies[selectedRally].events[selectedEvent]}
                   players={labelData.rallies[selectedRally].player_descriptons || {}}
                   onUpdateLabel={handleUpdateLabel}
                   allFrames={frames}
                   currentFrameIndex={getCurrentFrameIndex()}
                 />
               </div>
             </div>
           )}
        </>
      )}
      
      {/* Help Section */}
      <div className="collapse collapse-arrow bg-base-100 shadow-lg border border-base-300 rounded-lg">
        <input type="checkbox" /> 
        <div className="collapse-title font-medium text-base">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to Edit Shot Labels
          </div>
        </div>
        <div className="collapse-content"> 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
            <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
              <h4 className="text-base font-bold mb-3">Steps to Edit Shot Labels</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li className="text-sm">First generate shot labels in the "Shot Generator" tab</li>
                <li className="text-sm">Select a video with generated labels from the dropdown</li>
                <li className="text-sm">Choose a rally to edit from the buttons</li>
                <li className="text-sm">Select a specific shot within the rally</li>
                <li className="text-sm">Use the frame navigation to scroll ahead/back to see shot results</li>
                <li className="text-sm">Click "Edit Label" to modify shot properties</li>
                <li className="text-sm">Make changes to the shot's court position, shot type, technique, etc.</li>
                <li className="text-sm">Click "Save Changes" to update the label</li>
                <li className="text-sm">If using generated labels, click "Confirm All Labels" when done</li>
              </ol>
            </div>
            <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
              <h4 className="text-base font-bold mb-3">Frame Navigation</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li className="text-sm">Use the frame controls to scroll back/ahead up to 45 frames</li>
                <li className="text-sm">The slider lets you quickly jump to any frame within that range</li>
                <li className="text-sm">Frames ahead of the shot show the ball trajectory and outcome</li>
                <li className="text-sm">Click "Shot Frame" to return to the original shot position</li>
                <li className="text-sm">Use keyboard arrow keys for quick navigation</li>
              </ul>
              
              <h4 className="text-base font-bold mt-4 mb-2">Label Components</h4>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li className="text-sm"><span className="font-medium">Court Position:</span> near/far + deuce/ad</li>
                <li className="text-sm"><span className="font-medium">Shot Type:</span> serve, return, stroke</li>
                <li className="text-sm"><span className="font-medium">Technique:</span> forehand (fh), backhand (bh)</li>
                <li className="text-sm"><span className="font-medium">Style:</span> volley (v), slice (s), groundstroke (gs)</li>
                <li className="text-sm"><span className="font-medium">Direction:</span> crosscourt (CC), down the line (DL), inside-out (IO), inside-in (II)</li>
                <li className="text-sm"><span className="font-medium">Outcome:</span> in, error (err), winner (win)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="collapse collapse-arrow bg-base-100 shadow-lg border border-base-300 rounded-lg">
        <input type="checkbox" /> 
        <div className="collapse-title font-medium text-base">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Tennis Shot Labels Reference
          </div>
        </div>
        <div className="collapse-content"> 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
            <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
              <h4 className="text-base font-bold mb-3">Label Components</h4>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li className="text-sm"><span className="font-medium">Court Position:</span> Near/Far with Ad/Deuce</li>
                <li className="text-sm"><span className="font-medium">Side:</span> Forehand, Backhand</li>
                <li className="text-sm"><span className="font-medium">Shot Type:</span> Serve, Second-Serve, Return, Volley, Lob, Smash, Swing</li>
                <li className="text-sm"><span className="font-medium">Direction:</span>
                  <ul className="ml-4 list-disc list-inside space-y-1 mt-1">
                    <li className="text-xs"><em>For serves:</em> T (down the T), B (body), W (wide)</li>
                    <li className="text-xs"><em>For other shots:</em> CC (cross-court), DL (down the line), IO (inside-out), II (inside-in)</li>
                  </ul>
                </li>
                <li className="text-sm"><span className="font-medium">Formation:</span>
                  <ul className="ml-4 list-disc list-inside space-y-1 mt-1">
                    <li className="text-xs"><em>For serves:</em> Conventional, I-Formation, Australian</li>
                    <li className="text-xs"><em>For other shots:</em> Non-Serve</li>
                  </ul>
                </li>
                <li className="text-sm"><span className="font-medium">Outcome:</span> In, Win, Err</li>
              </ul>
            </div>
            
            <div className="card bg-base-200 shadow-sm p-3 rounded-lg">
              <h4 className="text-base font-bold mb-2">Valid Shot Combinations</h4>
              <div className="alert alert-info mb-3 text-xs p-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 h-4 w-4 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>The system validates shot patterns based on player handedness</span>
              </div>
              
              <div className="space-y-3 ml-2">
                <div>
                  <h5 className="font-medium text-sm mb-1 text-error">For Right-Handed Players:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                    <div className="card bg-base-100 p-2 shadow-sm">
                      <h6 className="font-medium text-xs mb-1">Ad Court:</h6>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        <li className="text-xs">Backhand → CC/DL</li>
                        <li className="text-xs">Forehand → II/IO (running around)</li>
                      </ul>
                    </div>
                    <div className="card bg-base-100 p-2 shadow-sm">
                      <h6 className="font-medium text-xs mb-1">Deuce Court:</h6>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        <li className="text-xs">Forehand → CC/DL</li>
                        <li className="text-xs">Backhand → II/IO</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h5 className="font-medium text-sm mb-1 text-primary">For Left-Handed Players:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                    <div className="card bg-base-100 p-2 shadow-sm">
                      <h6 className="font-medium text-xs mb-1">Ad Court:</h6>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        <li className="text-xs">Forehand → CC/DL</li>
                        <li className="text-xs">Backhand → II/IO</li>
                      </ul>
                    </div>
                    <div className="card bg-base-100 p-2 shadow-sm">
                      <h6 className="font-medium text-xs mb-1">Deuce Court:</h6>
                      <ul className="list-disc list-inside space-y-0.5 pl-1">
                        <li className="text-xs">Backhand → CC/DL</li>
                        <li className="text-xs">Forehand → II/IO (running around)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Video selector component
interface VideoSelectorProps {
  onSelectVideo: (videoFileName: string) => void;
  currentVideo: string | null;
}

const VideoSelector: React.FC<VideoSelectorProps> = ({ onSelectVideo, currentVideo }) => {
  const { videos, loading } = useVideos();
  const [filteredVideos, setFilteredVideos] = useState<string[]>([]);
  const backendUrl = 'http://localhost:5000';
  
  useEffect(() => {
    // Filter videos to only show ones that have generated labels
    const checkVideosWithLabels = async () => {
      const withLabels = [];
      for (const video of videos) {
        try {
          const videoId = video.split('.')[0];
          const response = await fetch(`${backendUrl}/api/label/check/${videoId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.exists) {
              withLabels.push(video);
            }
          }
        } catch (error) {
          console.error(`Error checking video ${video}:`, error);
        }
      }
      setFilteredVideos(withLabels);
    };
    
    checkVideosWithLabels();
  }, [videos]);
  
  return (
    <div className="form-control w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
          <select
            className="select select-bordered select-sm w-full pl-8"
            value={currentVideo || ""}
            onChange={(e) => onSelectVideo(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select a video with labels --</option>
            {filteredVideos.map((video) => (
              <option key={video} value={video}>
                {video}
              </option>
            ))}
          </select>
          <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-base-content opacity-70">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        
        {loading && (
          <span className="loading loading-spinner loading-sm text-primary"></span>
        )}
      </div>
      
      {filteredVideos.length === 0 && !loading && (
        <div className="alert alert-warning mt-4 shadow-sm text-sm">
          <div className="flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5 mt-0.5" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="ml-2">
              <h3 className="font-bold text-sm">No Videos Found</h3>
              <div className="text-xs mt-0.5">No videos with generated labels found. Please generate labels in the Shot Generator tab first.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShotLabelingView;