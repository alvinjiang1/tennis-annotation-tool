import { useState } from "react";
import UploadedVideos from "./UploadedVideos"
import FrameDisplay from "./FrameDisplay";
import InferenceStatus from "./InferenceStatus";

export default function ShotLabellingView () {
    const backendUrl = "http://localhost:5000"    
    const [selectedVideo, onSelectedVideos] = useState<string | null>(null);
    return (
        <>
        < InferenceStatus/>
        <UploadedVideos backendUrl={backendUrl} onSelectVideo={onSelectedVideos}/>
        {selectedVideo ? <FrameDisplay videoFilename={selectedVideo} labelShots={true}/> : null}
        </>        
    )
}