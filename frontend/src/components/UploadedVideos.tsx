import { useEffect, useState } from "react";

interface UploadedVideosProps {
  backendUrl: string;
  onSelectVideo: (videoUrl: string) => void;
}

const UploadedVideos: React.FC<UploadedVideosProps> = ({ backendUrl, onSelectVideo }) => {
  const [uploadedVideos, setUploadedVideos] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

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
  }, [backendUrl]);

  return (
    <div className="mb-4 p-4 border rounded-md shadow-md">
      <h3 className="text-lg font-bold">Previously Uploaded Videos</h3>
      {uploadedVideos.length > 0 ? (
        <>
          <select
            className="select select-bordered w-full mt-2"
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
              onClick={() => onSelectVideo(selectedVideo)}
            >
              Load Selected Video
            </button>
          )}
        </>
      ) : (
        <p className="text-gray-500 mt-2">No uploaded videos found.</p>
      )}
    </div>
  );
};

export default UploadedVideos;
