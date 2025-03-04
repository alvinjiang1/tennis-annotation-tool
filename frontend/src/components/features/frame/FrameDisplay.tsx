import React, { useState, useEffect } from "react";
import useFetchFrames from "../../../hooks/useFrames";

interface FrameDisplayProps {
  videoFilename: string;
  labelShots: boolean;
}

const FrameDisplay: React.FC<FrameDisplayProps> = ({ videoFilename, labelShots }) => {
  const { frames, loading, error } = useFetchFrames(videoFilename, labelShots);  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [frameInfo, setFrameInfo] = useState<{
    timestamp: string | null;
    frameNumber: number | null;
  }>({ timestamp: null, frameNumber: null });
  
  // Reset current index when frames change
  useEffect(() => {
    setCurrentIndex(0);
  }, [frames]);

  // Extract frame info from filename if available
  useEffect(() => {
    if (frames.length > 0 && currentIndex < frames.length) {
      const frameUrl = frames[currentIndex];
      const frameNumberMatch = frameUrl.match(/frame_(\d+)/);
      const frameNumber = frameNumberMatch ? parseInt(frameNumberMatch[1]) : null;
      
      // Calculate approximate timestamp (assuming 30fps)
      const timestamp = frameNumber 
        ? `${Math.floor(frameNumber / 30 / 60)}:${Math.floor((frameNumber / 30) % 60).toString().padStart(2, '0')}`
        : null;
      
      setFrameInfo({ timestamp, frameNumber });
    }
  }, [currentIndex, frames]);

  const handlePrevious = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const handleNext = () => setCurrentIndex((prev) => Math.min(frames.length - 1, prev + 1));
  const toggleAnnotation = () => setIsAnnotating(!isAnnotating);
  
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);
  
  // Jump to specific frame by index
  const jumpToFrame = (index: number) => {
    if (index >= 0 && index < frames.length) {
      setCurrentIndex(index);
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="card w-full bg-base-100 shadow-lg">
        <div className="card-body">
          <h2 className="card-title flex justify-between">
            <span>Extracted Frames</span>
            {frameInfo.frameNumber && (
              <div className="badge badge-primary badge-lg">
                Frame {frameInfo.frameNumber} 
                {frameInfo.timestamp && ` • ${frameInfo.timestamp}`}
              </div>
            )}
          </h2>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="loading loading-spinner loading-lg"></div>
              <span className="ml-3">Loading Frames...</span>
            </div>
          ) : error ? (
            <div className="alert alert-error">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          ) : frames.length > 0 ? (
            <div className="space-y-4">
              {/* Frame display area */}
              <div className="relative flex justify-center overflow-auto">
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center', transition: 'transform 0.2s' }}>
                  <img 
                    src={frames[currentIndex]} 
                    alt={`Frame ${currentIndex}`} 
                    className="max-w-full rounded-lg shadow-lg"
                  />
                </div>
              </div>
              
              {/* Zoom controls */}
              <div className="flex justify-center space-x-2">
                <button onClick={handleZoomOut} className="btn btn-sm btn-ghost" disabled={zoomLevel <= 0.5}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <button onClick={handleResetZoom} className="btn btn-sm">
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button onClick={handleZoomIn} className="btn btn-sm btn-ghost" disabled={zoomLevel >= 3}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              
              {/* Frame navigation */}
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="btn-group">
                  <button
                    onClick={() => jumpToFrame(0)}
                    className="btn btn-sm"
                    disabled={isAnnotating || currentIndex === 0}
                  >
                    ⏮️ First
                  </button>
                  <button
                    onClick={handlePrevious}
                    className="btn btn-sm"
                    disabled={isAnnotating || currentIndex === 0}
                  >
                    ⏪ Previous
                  </button>
                  <button
                    onClick={handleNext}
                    className="btn btn-sm"
                    disabled={isAnnotating || currentIndex === frames.length - 1}
                  >
                    Next ⏩
                  </button>
                  <button
                    onClick={() => jumpToFrame(frames.length - 1)}
                    className="btn btn-sm"
                    disabled={isAnnotating || currentIndex === frames.length - 1}
                  >
                    Last ⏭️
                  </button>
                </div>
                
                <button
                  onClick={toggleAnnotation}
                  className={`btn ${isAnnotating ? "btn-error" : "btn-primary"}`}
                >
                  {isAnnotating ? "Cancel Annotation" : "Start Annotating"}
                </button>
              </div>
              
              {/* Frame slider */}
              <div className="w-full flex items-center gap-2">
                <span className="text-sm">{currentIndex + 1}</span>
                <input
                  type="range"
                  min="0"
                  max={frames.length - 1}
                  value={currentIndex}
                  onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
                  disabled={isAnnotating}
                  className="range range-primary flex-1"
                />
                <span className="text-sm">{frames.length}</span>
              </div>
            </div>
          ) : (
            <div className="alert">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info shrink-0 w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>No frames found. Please upload a video first.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FrameDisplay;