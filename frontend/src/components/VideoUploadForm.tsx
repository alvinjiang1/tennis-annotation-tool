import { useState } from "react";

interface VideoUploadFormProps {
  backendUrl: string;
  onUploadSuccess: (videoUrl: string) => void;
}

const VideoUploadForm: React.FC<VideoUploadFormProps> = ({ backendUrl, onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onUploadSuccess(data.filename);
    } catch (err) {
      setError("Failed to upload video.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border rounded-md shadow-md">
      <h3 className="text-lg font-bold">Upload a New Video</h3>
      <input type="file" accept="video/*" onChange={handleFileChange} className="mt-2" />
      <button
        onClick={handleUpload}
        disabled={uploading}
        className="mt-2 btn btn-primary w-full"
      >
        {uploading ? "Uploading..." : "Upload Video"}
      </button>
      {error && <p className="text-red-500 mt-2">{error}</p>}
    </div>
  );
};

export default VideoUploadForm;
