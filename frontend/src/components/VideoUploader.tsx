import UploadedVideos from "./UploadedVideos";
import VideoUploadForm from "./VideoUploadForm";

interface VideoUploaderProps {
  onUploadSuccess: (videoUrl: string) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUploadSuccess }) => {
  const backendUrl = "http://localhost:5000"; // Adjust if needed

  return (
    <div className="p-4 border rounded-md shadow-md">
      <h2 className="text-xl font-bold mb-4">Select or Upload a Video</h2>
      
      {/* Component for selecting previously uploaded videos */}
      <UploadedVideos backendUrl={backendUrl} onSelectVideo={onUploadSuccess} />

      {/* Component for uploading a new video */}
      <VideoUploadForm backendUrl={backendUrl} onUploadSuccess={onUploadSuccess} />
    </div>
  );
};

export default VideoUploader;
