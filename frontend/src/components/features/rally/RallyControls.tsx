import React, { useState } from "react";

interface RallyControlsProps {
  currentFrameIndex: number;
  totalFrames: number;
  isRecordingRally: boolean;
  currentRallyId: string;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onJumpToFrame: (frameIndex: number) => void;
  onStartRally: () => void;
  onEndRally: () => void;
  onSaveRallyData: () => void;
  disabled?: boolean;
}

const RallyControls: React.FC<RallyControlsProps> = ({
  currentFrameIndex,
  totalFrames,
  isRecordingRally,
  currentRallyId,
  onPreviousFrame,
  onNextFrame,
  onJumpToFrame,
  onStartRally,
  onEndRally,
  onSaveRallyData,
  disabled = false
}) => {
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // For frame skipping
  const [skipFrames, setSkipFrames] = useState<number>(5);
  
  // Handle play/pause functionality
  React.useEffect(() => {
    let intervalId: number | null = null;
    
    if (isPlaying) {
      intervalId = setInterval(() => {
        if (currentFrameIndex < totalFrames - 1) {
          onNextFrame();
        } else {
          setIsPlaying(false);
        }
      }, 1000 / (playbackSpeed * 10)); // Adjustable speed
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlaying, currentFrameIndex, totalFrames, playbackSpeed, onNextFrame]);
  
  // Handle frame jumping
  const handleSkipBackward = () => {
    const newIndex = Math.max(0, currentFrameIndex - skipFrames);
    onJumpToFrame(newIndex);
  };
  
  const handleSkipForward = () => {
    const newIndex = Math.min(totalFrames - 1, currentFrameIndex + skipFrames);
    onJumpToFrame(newIndex);
  };
  
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Rally Status Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="font-medium mr-2">Rally Status:</span>
          {isRecordingRally ? (
            <div className="badge badge-error gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              Recording Rally #{currentRallyId}
            </div>
          ) : (
            <div className="badge badge-primary">Ready</div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            className="btn btn-success"
            onClick={onStartRally}
            disabled={disabled || isRecordingRally}
          >
            Start Rally
          </button>
          
          <button
            className="btn btn-error"
            onClick={onEndRally}
            disabled={disabled || !isRecordingRally}
          >
            End Rally
          </button>
          
          <button
            className="btn btn-primary"
            onClick={onSaveRallyData}
            disabled={disabled}
          >
            Save All Rally Data
          </button>
        </div>
      </div>
      
      {/* Playback Controls */}
      <div className="flex items-center justify-between">
        <div className="btn-group">
          <button
            className="btn btn-sm"
            onClick={handleSkipBackward}
            disabled={disabled || currentFrameIndex === 0}
          >
            ⏪ {skipFrames}
          </button>
          
          <button
            className="btn btn-sm"
            onClick={onPreviousFrame}
            disabled={disabled || currentFrameIndex === 0}
          >
            ◀️
          </button>
          
          <button
            className="btn btn-sm"
            onClick={handlePlayPause}
            disabled={disabled}
          >
            {isPlaying ? "⏸️" : "▶️"}
          </button>
          
          <button
            className="btn btn-sm"
            onClick={onNextFrame}
            disabled={disabled || currentFrameIndex === totalFrames - 1}
          >
            ▶️
          </button>
          
          <button
            className="btn btn-sm"
            onClick={handleSkipForward}
            disabled={disabled || currentFrameIndex === totalFrames - 1}
          >
            {skipFrames} ⏩
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm">Speed:</span>
          <select
            className="select select-sm select-bordered"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            disabled={disabled}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>
      
      {/* Frame Slider */}
      <div className="flex items-center gap-4">
        <span className="w-16 text-right">{currentFrameIndex + 1}</span>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrameIndex}
          onChange={(e) => onJumpToFrame(parseInt(e.target.value))}
          disabled={disabled}
          className="range range-primary flex-grow"
        />
        <span className="w-16">{totalFrames}</span>
      </div>
    </div>
  );
};

export default RallyControls;