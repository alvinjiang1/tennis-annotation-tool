import { useEffect, useRef, useState } from "react";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface BoundingBoxAnnotatorProps {
  imageUrl: string;  
  isAnnotating: boolean;
  setIsAnnotating: (isAnnotating: boolean) => void;
}

const BoundingBoxAnnotator: React.FC<BoundingBoxAnnotatorProps> = ({ imageUrl, isAnnotating , setIsAnnotating}) => {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 }); // Store original image size
  const [playerDescriptions, setPlayerDescriptions] = useState(["", "", "", ""]); // Empty descriptions
  const [selectedLabel, setSelectedLabel] = useState(""); // Initially empty
  const [descriptionsConfirmed, setDescriptionsConfirmed] = useState(false); // Prevent annotation before input
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setBoundingBoxes([]);
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
      drawBoundingBoxes(ctx, img);
    };
  }, [imageUrl, boundingBoxes, mousePos, currentBox]);

  const drawBoundingBoxes = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw saved bounding boxes
    boundingBoxes.forEach((box) => {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.fillStyle = "red";
      ctx.font = "14px Arial";
      ctx.fillText(box.label, box.x + 4, box.y + 12);
    });

    // ✅ Draw real-time bounding box while dragging
    if (currentBox) {
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
    }
    
    if (mousePos) {
      ctx.strokeStyle = "rgba(0, 255, 0, 0.5)"; // Green guide lines
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, ctx.canvas.height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(ctx.canvas.width, mousePos.y);
      ctx.stroke();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isAnnotating || !descriptionsConfirmed) return;

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
        width: Math.abs(x - startPos.x),
        height: Math.abs(y - startPos.y),
        label: selectedLabel || "Unknown",
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

  const handleSave = async () => {
    if (!imageUrl || boundingBoxes.length === 0) {
        alert("No annotations to save!");
        return;
    }
    
    try {
        const restResponse = await fetch("http://localhost:5000/api/annotation/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: imageUrl, 
              bounding_boxes: boundingBoxes, 
              width: imageSize['width'], 
              height: imageSize['height']})
        });

        const restData = await restResponse.json();
        if (!restResponse.ok) {
            throw new Error(`REST API failed: ${restData.error}`);
        }     
        
        setIsAnnotating(false);

        alert("Annotations saved via REST API (backup).");
    } catch (restError) {
        console.error("REST API request failed:", restError);
        alert("Failed to save annotations!");
    }
  };

  const handleDescriptionChange = (index: number, value: string) => {
    const newDescriptions = [...playerDescriptions];
    newDescriptions[index] = value;
    setPlayerDescriptions(newDescriptions);
  };

  const confirmDescriptions = () => {
    if (playerDescriptions.some((desc) => desc.trim() === "")) {
      alert("Please provide descriptions for all four players.");
      return;
    }
    setDescriptionsConfirmed(true);
    setSelectedLabel(playerDescriptions[0]); // Default selection
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold">{isAnnotating ? "Annotate Frame" : "Viewing Frame"}</h3>
      
      {!descriptionsConfirmed ? (
        <div className="mb-4">
          <h4 className="font-semibold mb-2">Enter player descriptions before annotating:</h4>
          <div className="grid grid-cols-2 gap-2">
            {playerDescriptions.map((desc, index) => (
              <input
                key={index}
                type="text"
                className="input input-bordered w-full"
                placeholder={`Player ${index + 1} description`}
                value={desc}
                onChange={(e) => handleDescriptionChange(index, e.target.value)}
              />              
              
            ))}            
          </div>
          <img src={imageUrl} className="border rounded"></img>
          <button className="btn btn-primary mt-2" onClick={confirmDescriptions}>
            Confirm & Start Annotating
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify gap-4 mb-2">
            {playerDescriptions.map((label, index) => (
              <button
                key={index}
                className={`btn ${selectedLabel === label ? "btn-primary" : "btn-outline"}`}
                onClick={() => setSelectedLabel(label)}
              >
                {label}
              </button>
            ))}
          </div>
          
          <div className="relative w-full flex justify-center">
            <canvas
              ref={canvasRef}
              className="border rounded-lg"
              onMouseDown={isAnnotating ? handleMouseDown : undefined}
              onMouseMove={handleMouseMove}
              onMouseUp={isAnnotating ? handleMouseUp : undefined}
            />
          </div>
          
          <div className="flex justify-center mt-2">
            <button className="btn btn-primary" onClick={handleSave}>
              Save Annotations
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BoundingBoxAnnotator;
