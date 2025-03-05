import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../../hooks";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  category_id: number;
}

interface HittingMomentMarkerProps {
  imageUrl: string;
  videoId: string;
  onMarkHittingMoment: (
    playerId: number, 
    position: { x: number, y: number },
    boundingBoxes: any[]
  ) => void;
}

const HittingMomentMarker: React.FC<HittingMomentMarkerProps> = ({
  imageUrl,
  videoId,
  onMarkHittingMoment
}) => {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [hoverBox, setHoverBox] = useState<number | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useToast();

  // Fetch existing bounding boxes and categories
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Get categories
        const categoryResponse = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          if (categoryData.categories && categoryData.categories.length > 0) {
            setCategories(categoryData.categories);
          }
        }
        
        // Get bounding boxes
        const boxesResponse = await fetch(`http://localhost:5000/api/annotation/get-bbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl }),
        });
        
        if (boxesResponse.ok) {
          const boxesData = await boxesResponse.json();
          if (boxesData && Array.isArray(boxesData)) {
            const boxes = boxesData.map((box: any) => ({
              x: box.bbox[0],
              y: box.bbox[1],
              width: box.bbox[2],
              height: box.bbox[3],
              label: box.label,
              category_id: box.category_id || 1
            }));
            setBoundingBoxes(boxes);
          }
        }
      } catch (error) {
        console.error("Failed to fetch bounding boxes:", error);
        showToast("Failed to load existing annotations", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [imageUrl, videoId]);

  // Initialize canvas and draw bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pre-set initial canvas size to avoid scaling issues
    canvas.width = 1280;  // Default width
    canvas.height = 720;  // Default height
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Show loading indicator
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading image...", canvas.width / 2, canvas.height / 2);

    const img = new Image();
    img.crossOrigin = "anonymous";  // Add this to handle CORS issues
    
    // Set up handlers before setting src
    img.onload = () => {
      // Set canvas dimensions to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw image
      ctx.drawImage(img, 0, 0);
      
      // Draw all bounding boxes
      boundingBoxes.forEach((box, index) => {
        drawBox(ctx, box, index === selectedBoxIndex, index === hoverBox);
      });
      
      // Add instructions
      if (boundingBoxes.length > 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(10, 10, 350, 35);
        ctx.fillStyle = "#fff";
        ctx.font = "16px Arial";
        ctx.fillText("Click on the player who is hitting the ball", 20, 32);
      } else {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(10, 10, 350, 35);
        ctx.fillStyle = "#fff";
        ctx.font = "16px Arial";
        ctx.fillText("No players detected. Edit bounding boxes first.", 20, 32);
      }
    };
    
    img.onerror = (e) => {
      console.error("Error loading image:", e);
      ctx.fillStyle = "#ffcccc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#FF0000";
      ctx.textAlign = "center";
      ctx.fillText("Error loading image", canvas.width / 2, canvas.height / 2);
    };
    
    // Add cache busting parameter to force reload
    img.src = `${imageUrl}?t=${new Date().getTime()}`;
  }, [imageUrl, boundingBoxes, selectedBoxIndex, hoverBox]);

  // Helper function to draw a bounding box
  const drawBox = (
    ctx: CanvasRenderingContext2D,
    box: BoundingBox,
    isSelected: boolean = false,
    isHovering: boolean = false
  ) => {
    // Define colors for different player categories
    const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
    const colorIndex = ((box.category_id || 1) - 1) % colors.length;
    
    // Set stroke color and width
    ctx.strokeStyle = isSelected 
      ? "#FFFFFF" 
      : isHovering 
        ? "#FFFF00" 
        : colors[colorIndex];
    ctx.lineWidth = isSelected || isHovering ? 4 : 2;
    
    // Draw the box
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    // Draw label background
    ctx.fillStyle = isHovering 
      ? "#FFFF00" 
      : colors[colorIndex];
    const category = categories.find(c => c.id === box.category_id);
    const labelText = category ? category.name : box.label;
    const textWidth = ctx.measureText(labelText).width + 10;
    ctx.fillRect(box.x, box.y - 25, textWidth, 25);
    
    // Draw label text
    ctx.fillStyle = isHovering ? "#000000" : "#FFFFFF";
    ctx.font = "16px Arial";
    ctx.fillText(labelText, box.x + 5, box.y - 7);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check if hovering over a box
    let hovering = false;
    for (let i = 0; i < boundingBoxes.length; i++) {
      const box = boundingBoxes[i];
      if (
        x >= box.x && 
        x <= box.x + box.width && 
        y >= box.y && 
        y <= box.y + box.height
      ) {
        setHoverBox(i);
        hovering = true;
        break;
      }
    }
    
    if (!hovering) {
      setHoverBox(null);
    }
    
    setIsHovering(hovering);
  };

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check if clicking on a box
    for (let i = 0; i < boundingBoxes.length; i++) {
      const box = boundingBoxes[i];
      if (
        x >= box.x && 
        x <= box.x + box.width && 
        y >= box.y && 
        y <= box.y + box.height
      ) {
        // Mark this player as hitting
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        // Convert bounding boxes to format needed for saving
        const boxesForSaving = boundingBoxes.map(b => ({
          bbox: [b.x, b.y, b.width, b.height],
          category_id: b.category_id,
          label: b.label
        }));
        
        onMarkHittingMoment(box.category_id, { x: centerX, y: centerY }, boxesForSaving);
        setSelectedBoxIndex(i);
        
        // Show confirmation
        showToast(`Marked ${box.label} as hitting the ball`, "success");
        break;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full cursor-pointer rounded-lg"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      ></canvas>
      
      {boundingBoxes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-100 bg-opacity-70 rounded-lg">
          <div className="text-center p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-warning mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-bold">No Players Detected</h3>
            <p className="mt-2">Use the "Edit Bounding Boxes" option to manually add players before marking hitting moments.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default HittingMomentMarker;