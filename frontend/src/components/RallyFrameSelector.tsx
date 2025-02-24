import { useEffect, useState } from "react";
import { saveHittingMoments } from "./annotationUtils";
import { SelectedFramesList } from "./SelectedFramesList";

interface RallyFrameSelectorProps {
    frameNumber: string;
    rallyFrames: { [key: string]: string[] };
    setRallyFrames: (frames: (prev: { [key: string]: string[] }) => { [key: string]: string[] }) => void;
    currentRallyId: string;
    setCurrentRallyId: (id: (prev: string) => string) => void;
    labelRally: boolean;
    setLabelRally: (label: boolean) => void;
}

export const RallyFrameSelector = ({ 
    frameNumber, 
    rallyFrames, 
    setRallyFrames, 
    currentRallyId, 
    setCurrentRallyId, 
    labelRally, 
    setLabelRally 
}: RallyFrameSelectorProps) => {    

    const [isFrameSelected, setIsFrameSelected] = useState(false);

    useEffect(() => {  
        const rallyKey = `rally_${currentRallyId}`;
        setIsFrameSelected(rallyFrames[rallyKey]?.includes(frameNumber) || false);
    }, [frameNumber, rallyFrames, currentRallyId]);

    const handleFrameSelection = () => {                    
        setRallyFrames((prev) => {
            const rallyKey = `rally_${currentRallyId}`;
            const updatedFrames = { ...prev };

            if (!updatedFrames[rallyKey]) {
                updatedFrames[rallyKey] = [];
            }

            if (updatedFrames[rallyKey].includes(frameNumber)) {
                updatedFrames[rallyKey] = updatedFrames[rallyKey].filter((f) => f !== frameNumber);
            } else {
                updatedFrames[rallyKey] = [...updatedFrames[rallyKey], frameNumber];
            }    

            return updatedFrames;
        });

        setIsFrameSelected((prev) => !prev);
    };

    const handleStartRally = () => {
        setLabelRally(true);
        setCurrentRallyId((prev: string) => (prev === "None" ? "1" : (parseInt(prev) + 1).toString()));
    };
    
    

    const handleSave = async () => {
        try {            
            await saveHittingMoments(rallyFrames);
            setLabelRally(false);
            alert("Hitting Moments Saved Successfully!");
        } catch (error) {
            console.error("Failed to save hitting moments:", error);
        }
    };

    return (
        <div className="p-4">
          <h3 className="text-lg font-bold">Rally Frame Selector</h3>
          <div className="flex justify-center mb-2 gap-20">
            <label className="mr-2">Current Rally Number: {currentRallyId}</label>
            <button className="btn btn-secondary" onClick={handleStartRally}>
              Start New Rally
            </button>
          </div>
          
        {labelRally && (
            <>
            <div className="flex justify-center mt-2">
                <button className="btn btn-primary ml-2" onClick={handleFrameSelection}>                    
                    {isFrameSelected ? "Deselect Frame" : "Select Frame"}
                </button>
            </div>
            <SelectedFramesList frames={rallyFrames[`rally_${currentRallyId}`] || []} />
            <div className="flex justify-center mt-2">
                <button className="btn btn-warning" onClick={handleSave}>
                    Save Hitting Moments
                </button>
            </div>
            </>
        )}
        </div>
    );
};
