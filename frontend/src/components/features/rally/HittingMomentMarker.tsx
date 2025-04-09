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
  const [hoverBox, setHoverBox] = useState<number | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [rawFrameUrl, setRawFrameUrl] = useState<string>("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { showToast } = useToast();

  // Generate raw frame URL from pose frame URL
  useEffect(() => {
    if (!imageUrl || !videoId) return;
    
    try {
      // Extract frame number from URL
      const parts = imageUrl.split('/');
      const frameFileName = parts[parts.length - 1];
      const frameNumberPart = frameFileName.split('_')[0]; // Get number part (e.g., "0001")
      
      // Create raw frame URL
      const rawUrl = `http://localhost:5000/api/video/frame/${videoId}/${frameNumberPart}.jpg`;
      setRawFrameUrl(rawUrl);
      console.log("Using raw frame URL:", rawUrl);
    } catch (error) {
      console.error("Error creating raw frame URL:", error);
      // Fallback to using original URL
      setRawFrameUrl(imageUrl);
    }
  }, [imageUrl, videoId]);

  // Fetch categories first
  useEffect(() => {
    if (!videoId) return;
    
    const fetchCategories = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          } else {
            console.warn("No categories found for video", videoId);
          }
        }
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    
    fetchCategories();
  }, [videoId]);

  // Load the image and get its dimensions
  useEffect(() => {
    if (!rawFrameUrl) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      setImageSize({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      
      if (imgRef.current) {
        imgRef.current.src = img.src;
      }            
    };
    
    img.onerror = (e) => {
      console.error("Error loading raw frame:", e);
      showToast("Failed to load raw frame, falling back to processed frame", "warning");
      
      // Fallback to original pose frame
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = "anonymous";
      
      fallbackImg.onload = () => {
        setImageSize({
          width: fallbackImg.naturalWidth,
          height: fallbackImg.naturalHeight
        });
        
        if (imgRef.current) {
          imgRef.current.src = fallbackImg.src;
        }
        
        setIsLoading(false);
      };
      
      fallbackImg.src = imageUrl;
    };
    
    // Cache busting
    const timestamp = new Date().getTime();
    img.src = `${rawFrameUrl}?t=${timestamp}`;
  }, [rawFrameUrl, imageUrl]);

  // Fetch existing bounding boxes
  useEffect(() => {
    if (!videoId || !imageUrl) return;
    
    const fetchBoundingBoxes = async () => {
      try {
        // Extract frame number from URL
        const parts = imageUrl.split('/');
        const frameFileName = parts[parts.length - 1];
        const frameNumber = frameFileName.split('_')[0]; // Get the number part
        
        // Try to get bounding boxes from the direct API
        try {
          // Try to fetch the JSON data with bounding boxes
          const boxResponse = await fetch(`http://localhost:5000/api/annotation/get-bbox`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_url: imageUrl }),
          });
          
          if (boxResponse.ok) {
            const boxesData = await boxResponse.json();
            
            if (boxesData && Array.isArray(boxesData)) {
              console.log("Received bbox data:", boxesData);
              
              const boxes = boxesData.map((box: any) => {
                // Use the label directly from the box data
                const label = box.label || "Player";
                
                // Find category based on label
                let categoryId = 1;
                if (categories.length > 0) {
                  const matchingCategory = categories.find(c => 
                    c.name.toLowerCase() === label.toLowerCase()
                  );
                  if (matchingCategory) {
                    categoryId = matchingCategory.id;
                  }
                }
                
                // Ensure bbox is in the right format (x1, y1, x2, y2)
                let x, y, width, height;
                
                if (box.bbox && box.bbox.length === 4) {
                  if (box.bbox[2] > box.bbox[0] && box.bbox[3] > box.bbox[1]) {
                    // Format is [x1, y1, x2, y2]
                    x = box.bbox[0];
                    y = box.bbox[1];
                    width = box.bbox[2] - box.bbox[0];
                    height = box.bbox[3] - box.bbox[1];
                  } else {
                    // Format is [x, y, w, h]
                    x = box.bbox[0];
                    y = box.bbox[1];
                    width = box.bbox[2];
                    height = box.bbox[3];
                  }
                  
                  return {
                    x,
                    y,
                    width,
                    height,
                    label,
                    category_id: box.category_id || categoryId
                  };
                } else {
                  console.error("Invalid bbox format:", box);
                  return null;
                }
              }).filter(Boolean);
              
              console.log("Processed boxes with correct labels:", boxes);
              setBoundingBoxes(boxes as BoundingBox[]);
            }
          }
        } catch (error) {
          console.error("Failed to fetch bounding boxes:", error);
          
          // Fall back to pose coordinates as last resort
          try {
            const frameKey = `frame_${frameNumber}`;
            const poseResponse = await fetch(`http://localhost:5000/api/annotation/get-pose-coordinates/${videoId}`);
            
            if (poseResponse.ok) {
              const poseData = await poseResponse.json();
              
              if (poseData[frameKey] && poseData[frameKey].length > 0) {
                const boxes = poseData[frameKey].map((item: any) => {
                  return {
                    x: item.bbox[0],
                    y: item.bbox[1],
                    width: item.bbox[2],
                    height: item.bbox[3],
                    label: item.label || "Player",
                    category_id: item.category_id || 1
                  };
                }).filter(Boolean);
                
                setBoundingBoxes(boxes as BoundingBox[]);
              }
            }
          } catch (fallbackError) {
            console.error("Fallback bbox fetching also failed:", fallbackError);
          }
        }
      } catch (error) {
        console.error("Failed to fetch bounding boxes:", error);
        showToast("Failed to load existing annotations", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBoundingBoxes();
  }, [imageUrl, videoId, categories]);

  // Handle container sizing and canvas setup
  useEffect(() => {
    if (!imageSize.width || !imageSize.height) return;
    
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        
        // Calculate canvas size based on container width and image aspect ratio
        const aspectRatio = imageSize.width / imageSize.height;
        const newWidth = containerWidth;
        const newHeight = containerWidth / aspectRatio;
        
        setCanvasSize({
          width: newWidth,
          height: newHeight
        });
      }
    };
    
    // Initial size update
    updateCanvasSize();
    
    // Update canvas size when window is resized
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [imageSize]);

  // Draw to the canvas when needed
  useEffect(() => {
    if (!canvasSize.width || !canvasSize.height) return;
    if (!imageSize.width || !imageSize.height) return;
    if (!canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions to match the calculated size
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    
    // Calculate scaling factor
    const scaleX = canvasSize.width / imageSize.width;
    const scaleY = canvasSize.height / imageSize.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image    
    ctx.drawImage(imgRef.current, 0, 0, canvasSize.width, canvasSize.height);
    
    // Draw bounding boxes with scaled coordinates
    boundingBoxes.forEach((box, index) => {
      const isSelected = index === selectedBoxIndex;
      const isHovered = index === hoverBox;
      
      // Define colors for different player labels
      const getColorForLabel = (label: string) => {
        // Map specific colors based on shirt colors in the label
        if (label.toLowerCase().includes("red")) return "#FF5555";
        if (label.toLowerCase().includes("blue") || label.toLowerCase().includes("black")) return "#5555FF";
        if (label.toLowerCase().includes("green")) return "#55FF55";
        if (label.toLowerCase().includes("yellow") || label.toLowerCase().includes("orange")) return "#FFAA00";
        if (label.toLowerCase().includes("pink") || label.toLowerCase().includes("purple")) return "#FF55FF";
        if (label.toLowerCase().includes("white")) return "#FFFFFF";
        
        // Fallback colors based on category ID
        const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
        const colorIndex = ((box.category_id || 1) - 1) % colors.length;
        return colors[colorIndex];
      };
      
      const boxColor = getColorForLabel(box.label);
      
      // Set stroke color and width
      ctx.strokeStyle = isSelected 
        ? "#FFFFFF" 
        : isHovered 
          ? "#FFFF00" 
          : boxColor;
      ctx.lineWidth = isSelected || isHovered ? 3 : 2;
      
      // Draw the box with scaled coordinates
      ctx.strokeRect(
        box.x * scaleX, 
        box.y * scaleY, 
        box.width * scaleX, 
        box.height * scaleY
      );
      
      // Draw label background
      const labelText = box.label;
      
      ctx.font = "14px Arial";
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width + 10;
      const textHeight = 20;
      
      ctx.fillStyle = isHovered ? "#FFFF00" : boxColor;
      ctx.fillRect(
        box.x * scaleX, 
        box.y * scaleY - textHeight, 
        textWidth, 
        textHeight
      );
      
      // Draw label text - use black or white depending on background color brightness
      const isLightColor = boxColor === "#FFFFFF" || boxColor === "#FFFF00" || boxColor === "#55FF55";
      ctx.fillStyle = isHovered || isLightColor ? "#000000" : "#FFFFFF";
      
      ctx.fillText(
        labelText, 
        box.x * scaleX + 5, 
        box.y * scaleY - 5
      );
    });
    
    // Add a small instruction tooltip instead of a large banner
    if (boundingBoxes.length > 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, 10, 240, 25);
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.fillText("Click on the player who is hitting the ball", 15, 25);
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, 10, 250, 25);
      ctx.fillStyle = "#fff";
      ctx.font = "12px Arial";
      ctx.fillText("No players detected. Edit bounding boxes first.", 15, 25);
    }
    
  }, [canvasSize, imageSize, boundingBoxes, selectedBoxIndex, hoverBox, categories]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (boundingBoxes.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate mouse position relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate scaling factors
    const scaleX = imageSize.width / canvasSize.width;
    const scaleY = imageSize.height / canvasSize.height;
    
    // Convert mouse position to original image coordinates
    const imageX = mouseX * scaleX;
    const imageY = mouseY * scaleY;
    
    // Check if hovering over a box
    let newHoverBox = null;
    
    for (let i = 0; i < boundingBoxes.length; i++) {
      const box = boundingBoxes[i];
      if (
        imageX >= box.x && 
        imageX <= box.x + box.width && 
        imageY >= box.y && 
        imageY <= box.y + box.height
      ) {
        newHoverBox = i;
        break;
      }
    }
    
    // Only update if changed
    if (newHoverBox !== hoverBox) {
      setHoverBox(newHoverBox);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (boundingBoxes.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate mouse position relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate scaling factors
    const scaleX = imageSize.width / canvasSize.width;
    const scaleY = imageSize.height / canvasSize.height;
    
    // Convert mouse position to original image coordinates
    const imageX = mouseX * scaleX;
    const imageY = mouseY * scaleY;
    
    // Check if clicking on a box
    for (let i = 0; i < boundingBoxes.length; i++) {
      const box = boundingBoxes[i];
      if (
        imageX >= box.x && 
        imageX <= box.x + box.width && 
        imageY >= box.y && 
        imageY <= box.y + box.height
      ) {
        // Mark this player as hitting
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        
        // Convert bounding boxes to the format expected by the callback
        const boxesForSaving = boundingBoxes.map(b => ({
          bbox: [
            b.x,                // x1
            b.y,                // y1
            b.x + b.width,      // x2
            b.y + b.height      // y2
          ],
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

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Hidden image reference */}
      <img 
        ref={imgRef} 
        style={{ display: 'none' }} 
        alt="hidden reference" 
      />
      
      {isLoading ? (
        <div className="flex justify-center items-center min-h-64 py-12">
          <div className="loading loading-spinner loading-lg"></div>
        </div>
      ) : (
        <div className="w-full flex justify-center">
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="rounded-lg shadow-md cursor-pointer max-w-full"
            style={{ 
              width: canvasSize.width, 
              height: canvasSize.height,
              maxWidth: '100%'
            }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
          />
        </div>
      )}
      
      {!isLoading && boundingBoxes.length === 0 && (
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