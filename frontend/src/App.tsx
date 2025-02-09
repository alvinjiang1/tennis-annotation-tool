import { useState } from "react";
import VideoUploader from "./components/VideoUploader";
import FrameDisplay from "./components/FrameDisplay";
import Toolbar from "./components/Toolbar";

const App: React.FC = () => {
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);

  return (
    <div className="app-container flex h-screen">
      {/* Left Toolbar */}
      <Toolbar />

      {/* Right Section */}
      <div className="content flex-1 p-4">
        <h1 className="text-3xl font-bold text-white mb-4">Tennis Annotation Tool</h1>

        {/* Video Upload */}
        <VideoUploader onUploadSuccess={setUploadedVideo} />

        {/* Video Player & Controls */}
        {uploadedVideo && (
          <>            
            <FrameDisplay videoFilename={uploadedVideo} />
          </>
        )}
      </div>
    </div>
  );
};

export default App;
