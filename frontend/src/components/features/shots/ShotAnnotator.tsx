import { BoundingBox } from "../annotation/BoundingBoxAnnotator";
import { useEffect, useRef, useState } from "react";
import { fetchBoundingBoxes, saveBoundingBoxes, drawBoundingBoxes } from "../../annotationUtils";
import { RallyFrameSelector } from "../../RallyFrameSelector";
import { ShotLabelGenerator } from "../../ShotLabelGenerator";

interface ShotAnnotatorProps {
  imageUrl: string;  
  isAnnotating: boolean;
  setIsAnnotating: (isAnnotating: boolean) => void;
  triggerRefresh: () => void;
  rallyFrames: {[key: string]: string[]};
  setRallyFrames: (frames: (prev: { [key: string]: string[] }) => { [key: string]: string[] }) => void;
  currentRallyId: string;
  setCurrentRallyId: (id: (prev: string) => string) => void;
  labelRally: boolean;
  setLabelRally: (label: boolean) => void;
}

const ShotAnnotator: React.FC<ShotAnnotatorProps> = ({
  imageUrl,    
  isAnnotating,
  setIsAnnotating,
  triggerRefresh, // Destructure triggerRefresh
  rallyFrames,
  setRallyFrames,
  currentRallyId,
  setCurrentRallyId,
  labelRally,
  setLabelRally

}) => {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (imageUrl) {
      fetchBoundingBoxes(imageUrl, setBoundingBoxes);
    }
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      canvas.width = img.width;
      canvas.height = img.height;
      drawBoundingBoxes(ctx, img, boundingBoxes, currentBox, mousePos, true);
    };
  }, [imageUrl, boundingBoxes, mousePos, currentBox]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isAnnotating) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setStartPos({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setMousePos({ x, y });

    if (isDrawing && startPos) {
      setCurrentBox({
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
        width: Math.max(x, startPos.x),
        height: Math.max(y, startPos.y),
        label: "New Label",
      });
    }
  };

  const handleMouseUp = () => {
    if (!isAnnotating || !isDrawing || !startPos || !currentBox) return;

    setBoundingBoxes((prev) => [...prev, currentBox]);
    setIsDrawing(false);
    setStartPos(null);
    setCurrentBox(null);
  };

  const handleBoxChange = (index: number, updatedBox: BoundingBox) => {
    const updatedBoxes = boundingBoxes.map((box, i) =>
      i === index ? updatedBox : box
    );
    setBoundingBoxes(updatedBoxes);
  };

  const handleDeleteBox = (index: number) => {
    setBoundingBoxes(boundingBoxes.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!imageUrl || boundingBoxes.length === 0) {
        alert("No annotations to save!");
        return;
    }
    
    try {
        await saveBoundingBoxes(imageUrl, boundingBoxes);        
        setIsAnnotating(false);
        triggerRefresh(); // Trigger refresh after saving
    } catch (error) {
        console.error("Failed to save annotations:", error);
        alert("Failed to save annotations!");
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold">Shot Annotation</h3>    
      <div className="relative w-full flex justify-center">
        <canvas
          ref={canvasRef}
          className="border rounded-lg"
          onMouseDown={isAnnotating ? handleMouseDown : undefined}
          onMouseMove={handleMouseMove}
          onMouseUp={isAnnotating ? handleMouseUp : undefined}
        />
      </div>

      <div className="flex flex-col mt-2">
        {boundingBoxes.map((box, index) => (
          <div key={index} className="justify-center flex gap-2">
            <input
              type="text"
              value={box.label}
              onChange={(e) =>
                handleBoxChange(index, { ...box, label: e.target.value })
              }
            />
            <button onClick={() => handleDeleteBox(index)}>Delete</button>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-2">
        <button className="btn btn-primary" onClick={handleSave}>
          Save Bounding Boxes
        </button>
      </div>
      <RallyFrameSelector 
      frameNumber={imageUrl} 
      rallyFrames={rallyFrames} 
      setRallyFrames={setRallyFrames} 
      currentRallyId={currentRallyId}
      setCurrentRallyId={setCurrentRallyId}
      labelRally={labelRally}
      setLabelRally={setLabelRally}/>
      <ShotLabelGenerator imageUrl={imageUrl}/>
    </div>
  );
};

export default ShotAnnotator;