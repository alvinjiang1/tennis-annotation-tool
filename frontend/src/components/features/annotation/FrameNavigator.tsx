interface FrameNavigatorProps {
  currentIndex: number;
  totalFrames: number;
  isAnnotating: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnnotation: () => void;
  onSliderChange: (value: number) => void;
  disableAnnotation?: boolean; // New prop to disable annotation button
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
    </div>
  );
};

export default FrameNavigator;