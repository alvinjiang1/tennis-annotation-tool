import { useEffect, useState } from "react";

interface VideoUploaderProps {
  onUploadSuccess: (videoUrl: string) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedVideos, setUploadedVideos] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const backendUrl = "http://localhost:5000"; // Adjust if needed

  useEffect(() => {
    // Fetch existing uploaded videos
    const fetchUploadedVideos = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/video/uploaded-videos`);
        const data = await response.json();
        if (response.ok) {
          setUploadedVideos(data.videos);
        } else {
          console.error("Error fetching videos:", data.error);
        }
      } catch (error) {
        console.error("Failed to fetch videos:", error);
      }
    };

    fetchUploadedVideos();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please select a video file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("video", selectedFile);

    try {
      setUploading(true);
      const response = await fetch(`${backendUrl}/api/video/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      onUploadSuccess(data.filename); // Use filename instead of full path
    } catch (err) {
      setError("Failed to upload video.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-md shadow-md">
      <h3 className="text-lg font-bold">Select or Upload a Video</h3>

      {/* Dropdown for existing videos */}
      {uploadedVideos.length > 0 && (
        <div className="mb-4">
          <label className="block font-semibold">Previously Uploaded Videos:</label>
          <select
            className="select select-bordered w-full"
            value={selectedVideo || ""}
            onChange={(e) => setSelectedVideo(e.target.value)}
          >
            <option value="">-- Select a Video --</option>
            {uploadedVideos.map((video, index) => (
              <option key={index} value={video}>
                {video}
              </option>
            ))}
          </select>
          {selectedVideo && (
            <button
              className="mt-2 btn btn-primary w-full"
              onClick={() => onUploadSuccess(selectedVideo)}
            >
              Load Selected Video
            </button>
          )}
        </div>
      )}

      {/* File upload */}
      <input type="file" accept="video/*" onChange={handleFileChange} className="mt-2" />
      <button
        onClick={handleUpload}
        disabled={uploading}
        className="mt-2 btn btn-primary w-full"
      >
        {uploading ? "Uploading..." : "Upload New Video"}
      </button>
      
      {error && <p className="text-red-500 mt-2">{error}</p>}
    </div>
  );
};

export default VideoUploader;
