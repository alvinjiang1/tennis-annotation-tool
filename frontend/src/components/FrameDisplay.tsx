import { useEffect, useState } from "react";
import BoundingBoxAnnotator from "./BoundingBoxAnnotator";

interface FrameDisplayProps {
  videoFilename: string;
}

const FrameDisplay: React.FC<FrameDisplayProps> = ({ videoFilename }) => {
  const [frames, setFrames] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const backendUrl = "http://localhost:5000";

  useEffect(() => {
    if (!videoFilename) return;

    const fetchFrames = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/video/frames?filename=${videoFilename}`);
        const data = await response.json();

        if (response.ok) {
          setFrames(data.frames.map((frame: string) => `${backendUrl}/api/video/frame/${frame}`));
        } else {
          console.error("Error fetching frames:", data.error);
        }
      } catch (error) {
        console.error("Failed to fetch frames:", error);
      }
    };

    fetchFrames();
  }, [videoFilename]);

  return (
    <div className="frame-container flex flex-col items-center p-4">
      <h3 className="text-lg font-bold">Extracted Frames</h3>

      {frames.length > 0 ? (
        <div className="relative w-full max-w-3xl">
          <div className="flex justify-between mt-2">
            {/* Navigation Buttons */}
            <button
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="btn btn-secondary"
              disabled={isAnnotating}
            >
              ⏪ Previous
            </button>

            {/* Annotation Toggle */}
            <button
              onClick={() => setIsAnnotating(!isAnnotating)}
              className={`btn ${isAnnotating ? "btn-accent" : "btn-primary"}`}
            >
              {isAnnotating ? "Cancel Annotation" : "Annotate"}
            </button>

            <button
              onClick={() => setCurrentIndex((prev) => Math.min(frames.length - 1, prev + 1))}
              className="btn btn-secondary"
              disabled={isAnnotating}
            >
              Next ⏩
            </button>
          </div>          
          <BoundingBoxAnnotator imageUrl={frames[currentIndex]} isAnnotating={isAnnotating}/>
                   
        </div>
      ) : (
        <p>No frames found. Please upload a video first.</p>
      )}
    </div>
  );
};

export default FrameDisplay;
