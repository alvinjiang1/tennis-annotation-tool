import { useEffect, useState } from "react";

interface SelectedFramesListProps {
    frames: string[];
}

export const SelectedFramesList = ({frames}: SelectedFramesListProps) => {
    const [selectedFrames, setFrames] = useState<string[]>([]);
    useEffect(() => {
        setFrames(selectedFrames);        
    }, [frames]);
    return (
        <div className="mt-4">
            <h4 className="text-md font-bold">Selected Frames</h4>
            <ul className="list-disc list-inside">
                {frames.map((frame, index) => (                    
                    <li key={index}>{frame.split("/")[frame.split("/").length - 1]}</li>                
                ))}
            </ul>         
        </div>
    );
};