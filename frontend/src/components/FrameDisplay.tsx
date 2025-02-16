import { useState } from "react";
import BoundingBoxAnnotator from "./BoundingBoxAnnotator";
import FrameNavigator from "./FrameNavigator";
import ShotAnnotator from "./ShotAnnotator";
import useFetchFrames from "./api";

interface FrameDisplayProps {
  videoFilename: string;
  labelShots: boolean;
}

const FrameDisplay: React.FC<FrameDisplayProps> = ({ videoFilename, labelShots}) => {
  const { frames, loading, error } = useFetchFrames(videoFilename, labelShots);  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnnotating, setIsAnnotating] = useState(false);  

  const handlePrevious = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const handleNext = () => setCurrentIndex((prev) => Math.min(frames.length - 1, prev + 1));
  const toggleAnnotation = () => setIsAnnotating(!isAnnotating);
  const handleSliderChange = (value: number) => setCurrentIndex(value);

  return (
    <div className="frame-container flex flex-col items-center p-4">
      <h3 className="text-lg font-bold">Extracted Frames</h3>
      {
        loading ? (
          <p>Loading Frames...</p>
        ) : error  ? (
          <p className="text-red-500">{error}</p>
        ) : frames.length > 0 ? (
            <div className="relative w-full max-w-3xl">
              {/* Navigation Component */}
              <FrameNavigator
                currentIndex={currentIndex}
                totalFrames={frames.length}
                isAnnotating={isAnnotating}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onToggleAnnotation={toggleAnnotation}
                onSliderChange={handleSliderChange}
              />

              {/* Bounding Box Annotator */}
              {!labelShots && <BoundingBoxAnnotator
                imageUrl={frames[currentIndex]}
                isAnnotating={isAnnotating}
                setIsAnnotating={setIsAnnotating}
                videoId={videoFilename.split(".")[0]}
              />}
              {labelShots && <ShotAnnotator
                imageUrl={frames[currentIndex]}
                isAnnotating={isAnnotating}
                setIsAnnotating={setIsAnnotating}
              />}
            </div>
          ) : (
            <p>No frames found. Please upload a video first.</p>
          )}
    </div>
  );
};

export default FrameDisplay;