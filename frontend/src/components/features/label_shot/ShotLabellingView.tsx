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
      
      // Check and load label data
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
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Shot Label Editor</h2>
        {isLoading && (
          <div className="flex items-center">
            <span className="loading loading-spinner loading-md mr-2"></span>
            <span>Loading...</span>
          </div>
        )}
      </div>
      
      {/* Video Selection */}
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title">Select Video</h3>
          <VideoSelector onSelectVideo={handleVideoSelection} currentVideo={selectedVideo} />
          
          {/* Data source indicator & confirmation button */}
          {labelData && (
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center">
                <span className="mr-2">Source:</span>
                <div className={`badge ${dataSource === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                  {dataSource === 'confirmed' ? 'Confirmed Labels' : 'Generated Labels'}
                </div>
              </div>
              
              {dataSource === 'generated' && (
                <button
                  className="btn btn-sm btn-success"
                  onClick={handleConfirmLabels}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
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
          <div className="card bg-base-100 shadow-lg">
            <div className="card-body">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                {/* Rally Selection */}
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-2">Select Rally</h3>
                  <div className="flex flex-wrap gap-2">
                    {labelData.rallies.map((rally, index) => (
                      <button
                        key={index}
                        className={`btn ${selectedRally === index ? 'btn-primary' : 'btn-outline'}`}
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
                    <h3 className="text-lg font-bold mb-2">Select Shot</h3>
                    <div className="flex flex-wrap gap-2">
                      {labelData.rallies[selectedRally].events.map((event, index) => (
                        <button
                          key={index}
                          className={`btn btn-sm ${
                            selectedEvent === index ? 'btn-accent' : 
                            event.outcome === 'err' ? 'btn-error btn-outline' :
                            event.outcome === 'win' ? 'btn-success btn-outline' :
                            'btn-outline'
                          }`}
                          onClick={() => setSelectedEvent(index)}
                        >
                          #{index + 1} ({event.player})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Label Editor */}
          {labelData.rallies[selectedRally] && 
           labelData.rallies[selectedRally].events[selectedEvent] && (
            <LabelEditor
              frameUrl={getCurrentFrameUrl()}
              label={labelData.rallies[selectedRally].events[selectedEvent]}
              players={labelData.rallies[selectedRally].player_descriptons || {}}
              onUpdateLabel={handleUpdateLabel}
            />
          )}
        </>
      )}
      
      {/* Help Section */}
      <div className="collapse collapse-arrow bg-base-100 shadow-lg">
        <input type="checkbox" /> 
        <div className="collapse-title font-medium">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to Edit Shot Labels
          </div>
        </div>
        <div className="collapse-content"> 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Steps to Edit Shot Labels</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>First generate shot labels in the "Shot Generator" tab</li>
                <li>Select a video with generated labels from the dropdown</li>
                <li>Choose a rally to edit from the buttons</li>
                <li>Select a specific shot within the rally</li>
                <li>Click "Edit Label" to modify shot properties</li>
                <li>Make changes to the shot's court position, shot type, technique, etc.</li>
                <li>Click "Save Changes" to update the label</li>
                <li>If using generated labels, click "Confirm All Labels" to save to confirmed_labels</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Label Components</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>Court Position:</strong> near/far + deuce/ad</li>
                <li><strong>Shot Type:</strong> serve, return, stroke</li>
                <li><strong>Technique:</strong> forehand (fh), backhand (bh)</li>
                <li><strong>Style:</strong> volley (v), slice (s), groundstroke (gs)</li>
                <li><strong>Direction:</strong> crosscourt (CC), down the line (DL), inside-out (IO), inside-in (II)</li>
                <li><strong>Outcome:</strong> in, error (err), winner (win)</li>
              </ul>
              
              <h4 className="font-semibold mt-4 mb-2">About Label Sources</h4>
              <p className="text-sm">
                <strong>Generated Labels:</strong> Initial AI-generated labels stored in the "generated_labels" directory.
              </p>
              <p className="text-sm">
                <strong>Confirmed Labels:</strong> Edited and reviewed labels stored in the "confirmed_labels" directory. These take precedence over generated labels.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="collapse collapse-arrow bg-base-100 shadow-lg">
  <input type="checkbox" /> 
  <div className="collapse-title font-medium">
    <div className="flex items-center">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Tennis Shot Labels Reference
    </div>
  </div>
  <div className="collapse-content"> 
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h4 className="font-semibold mb-2">Label Components</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>Court Position:</strong> Near/Far with Ad/Deuce</li>
          <li><strong>Side:</strong> Forehand, Backhand</li>
          <li><strong>Shot Type:</strong> Serve, Second-Serve, Return, Volley, Lob, Smash, Swing</li>
          <li><strong>Direction:</strong>
            <ul className="ml-6 list-disc list-inside space-y-0">
              <li><em>For serves:</em> T (down the T), B (body), W (wide)</li>
              <li><em>For other shots:</em> CC (cross-court), DL (down the line), IO (inside-out), II (inside-in)</li>
            </ul>
          </li>
          <li><strong>Formation:</strong>
            <ul className="ml-6 list-disc list-inside space-y-0">
              <li><em>For serves:</em> Conventional, I-Formation, Australian</li>
              <li><em>For other shots:</em> Non-Serve</li>
            </ul>
          </li>
          <li><strong>Outcome:</strong> In, Win, Err</li>
        </ul>
      </div>
      
      <div>
        <h4 className="font-semibold mb-2">Valid Shot Combinations</h4>
        <div className="alert alert-info mb-2 text-xs p-2">
          The system validates shot patterns based on player handedness
        </div>
        <h5 className="font-medium">For Right-Handed Players:</h5>
        <ul className="ml-4 list-disc list-inside text-sm">
          <li><strong>Ad Court:</strong>
            <ul className="ml-6 list-disc list-inside text-xs">
              <li>Backhand → CC/DL</li>
              <li>Forehand → II/IO (running around backhand)</li>
            </ul>
          </li>
          <li><strong>Deuce Court:</strong>
            <ul className="ml-6 list-disc list-inside text-xs">
              <li>Forehand → CC/DL</li>
              <li>Backhand → II/IO</li>
            </ul>
          </li>
        </ul>
        
        <h5 className="font-medium mt-2">For Left-Handed Players:</h5>
        <ul className="ml-4 list-disc list-inside text-sm">
          <li><strong>Ad Court:</strong>
            <ul className="ml-6 list-disc list-inside text-xs">
              <li>Forehand → CC/DL</li>
              <li>Backhand → II/IO</li>
            </ul>
          </li>
          <li><strong>Deuce Court:</strong>
            <ul className="ml-6 list-disc list-inside text-xs">
              <li>Backhand → CC/DL</li>
              <li>Forehand → II/IO (running around backhand)</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>

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
        <select
          className="select select-bordered w-full"
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
        
        {loading && <span className="loading loading-spinner loading-sm"></span>}
      </div>
      
      {filteredVideos.length === 0 && !loading && (
        <div className="alert alert-warning mt-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 h-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>No videos with generated labels found. Please generate labels in the Shot Generator tab first.</span>
        </div>
      )}
    </div>
  );
};

export default ShotLabelingView;