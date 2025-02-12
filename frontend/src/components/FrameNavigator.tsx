interface FrameNavigatorProps {
    currentIndex: number;
    totalFrames: number;
    isAnnotating: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onToggleAnnotation: () => void;
  }
  
  const FrameNavigator: React.FC<FrameNavigatorProps> = ({
    currentIndex,
    totalFrames,
    isAnnotating,
    onPrevious,
    onNext,
    onToggleAnnotation,
  }) => {
    return (
      <div className="flex justify-between mt-2">
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
          className={`btn ${isAnnotating ? "btn-accent" : "btn-primary"}`}
        >
          {isAnnotating ? "Cancel Annotation" : "Annotate"}
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
    );
  };
  
  export default FrameNavigator;
  