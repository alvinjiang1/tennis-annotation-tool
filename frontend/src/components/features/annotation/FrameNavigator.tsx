import React, { useEffect } from "react";

interface FrameNavigatorProps {
  currentIndex: number;
  totalFrames: number;
  isAnnotating: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnnotation: () => void;
  onSliderChange: (value: number) => void;
  disableAnnotation?: boolean; // Prop to disable annotation button
}

const FrameNavigator: React.FC<FrameNavigatorProps> = ({
  currentIndex,
  totalFrames,
  isAnnotating,
  onPrevious,
  onNext,
  onToggleAnnotation,
  onSliderChange,
  disableAnnotation = false,
}) => {
  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if we're in a text input, textarea, or select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      
      // Skip keyboard navigation if currently annotating
      if (isAnnotating) {
        return;
      }
      
      switch (e.key) {
        case 'ArrowLeft':
          // Previous frame
          if (currentIndex > 0) {
            onPrevious();
            e.preventDefault();
          }
          break;
          
        case 'ArrowRight':
          // Next frame
          if (currentIndex < totalFrames - 1) {
            onNext();
            e.preventDefault();
          }
          break;
          
        case 'Home':
          // First frame
          onSliderChange(0);
          e.preventDefault();
          break;
          
        case 'End':
          // Last frame
          onSliderChange(totalFrames - 1);
          e.preventDefault();
          break;
          
        case 'PageUp':
          // Jump back 10 frames
          onSliderChange(Math.max(0, currentIndex - 10));
          e.preventDefault();
          break;
          
        case 'PageDown':
          // Jump forward 10 frames
          onSliderChange(Math.min(totalFrames - 1, currentIndex + 10));
          e.preventDefault();
          break;
          
        case 'a':
          // Toggle annotation mode (if not disabled)
          if (!disableAnnotation) {
            onToggleAnnotation();
            e.preventDefault();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, totalFrames, isAnnotating, onPrevious, onNext, onSliderChange, onToggleAnnotation, disableAnnotation]);

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex justify-between">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          className="btn btn-secondary"
          disabled={isAnnotating || currentIndex === 0}
        >
          ⏪ Previous
        </button>

        {/* Annotation Toggle Button */}
        <button
          onClick={onToggleAnnotation}
          className={`btn ${isAnnotating ? "btn-error" : "btn-primary"}`}
          disabled={disableAnnotation} // Disable if player descriptions aren't complete
          title={disableAnnotation ? "Complete player descriptions first" : ""}
        >
          {isAnnotating ? "Cancel Annotation" : "Start Annotating"}
        </button>

        {/* Next Button */}
        <button
          onClick={onNext}
          className="btn btn-secondary"
          disabled={isAnnotating || currentIndex === totalFrames - 1}
        >
          Next ⏩
        </button>
      </div>

      {/* Slider Control */}
      <div className="flex items-center gap-2 w-full">
        <span className="text-sm w-20">Frame {currentIndex + 1}</span>
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentIndex}
          onChange={(e) => onSliderChange(Number(e.target.value))}
          disabled={isAnnotating}
          className="flex-grow h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm w-20 text-right">of {totalFrames}</span>
      </div>
      
      {/* Keyboard shortcuts info */}
      <div className="mt-2 text-xs text-center text-base-content/70">
        <p>Keyboard shortcuts: ← → (Previous/Next), Home/End (First/Last), 
          PgUp/PgDn (Jump 10 frames), A (Toggle Annotation)</p>
      </div>
    </div>
  );
};

export default FrameNavigator;