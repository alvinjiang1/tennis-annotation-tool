import { useRef, useState } from "react";

interface VideoPlayerProps {
  videoUrl: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl }) => {  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime += seconds;
  };
  
  console.log("Uploaded video URL:", videoUrl);

  return (
    <div className="card bg-base-200 p-4 shadow-lg">
      <h2 className="text-lg font-bold mb-2">Video Playback</h2>
      <video ref={videoRef} src={videoUrl} controls className="rounded-lg w-full shadow-lg" />
      <div className="flex justify-center gap-4 mt-3">
        <button onClick={() => seek(-5)} className="btn btn-secondary">⏪ -5s</button>
        <button onClick={togglePlay} className="btn btn-primary">
          {isPlaying ? "Pause ⏸" : "Play ▶"}
        </button>
        <button onClick={() => seek(5)} className="btn btn-secondary">⏩ +5s</button>
      </div>
    </div>
  );
};

export default VideoPlayer;
