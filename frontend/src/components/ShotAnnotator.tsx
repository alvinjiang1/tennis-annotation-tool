import { useEffect, useRef, useState } from "react";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface ShotAnnotatorProps {
  imageUrl: string;
  isAnnotating: boolean;
  setIsAnnotating: (isAnnotating: boolean) => void;
}

const ShotAnnotator: React.FC<ShotAnnotatorProps> = ({
  imageUrl,
  isAnnotating,
  setIsAnnotating,
}) => {    
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 }); // Store original image size
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // useEffect(() => {    
  //   if (imageUrl) {
  //     fetchBoundingBoxes();
  //   }
  // }, [imageUrl]);  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setImageSize({width: img.width, height: img.height});
      canvas.width = img.width;
      canvas.height = img.height;  
      ctx.drawImage(img, 0, 0)    
    }
  }, [imageUrl]);


  /** 🔍 Fetch Bounding Boxes from GroundingDINO Backend */
  const fetchBoundingBoxes = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/inference/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Inference Failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to fetch bounding boxes:", error);
    }
  };

  /** 💾 Save the bounding boxes to the backend */
  const handleSave = async () => {
    alert("Annotations saved succesfully!")  
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold">Shot Annotation</h3>

      <div className="relative w-full flex justify-center">
        <canvas ref={canvasRef} className="border rounded-lg" />
      </div>

      <div className="flex justify-center mt-2">
        <button className="btn btn-primary" onClick={handleSave}>
          Save Annotations
        </button>
      </div>
    </div>
  );
};

export default ShotAnnotator;
