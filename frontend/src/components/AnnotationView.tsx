import {useState} from 'react';
import VideoUploader from './VideoUploader';
import FrameDisplay from './FrameDisplay';

export default function AnnotationView () {
    const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
    
    return (        
        <>
        <VideoUploader onUploadSuccess={setUploadedVideo} />        
        {uploadedVideo && (                   
        <FrameDisplay videoFilename={uploadedVideo} labelShots={false}/>        
        )}
        </>

    );
}