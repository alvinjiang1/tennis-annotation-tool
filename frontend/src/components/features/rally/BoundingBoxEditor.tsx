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

interface BoundingBoxEditorProps {
  imageUrl: string;
  videoId: string;
  frameIndex: number;
  onSaveComplete: () => void;
}

const BoundingBoxEditor: React.FC<BoundingBoxEditorProps> = ({
  imageUrl,
  videoId,
  frameIndex,
  onSaveComplete
}) => {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [rawFrameUrl, setRawFrameUrl] = useState<string>("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useToast();

  // Convert pose frame URL to raw frame URL
  useEffect(() => {
    if (!imageUrl) return;
    
    // Extract frame number from URL
    // Typical pose URL: http://localhost:5000/api/inference/frame/video_id/0001_pred.jpg
    const parts = imageUrl.split('/');
    const frameFileName = parts[parts.length - 1];
    const frameNumber = frameFileName.split('_')[0]; // Get the number part (e.g., "0001")
    
    // Construct raw frame URL
    const rawUrl = `http://localhost:5000/api/video/frame/${videoId}/${frameNumber}.jpg`;
    console.log("Setting raw frame URL:", rawUrl);
    setRawFrameUrl(rawUrl);
  }, [imageUrl, videoId]);

  // Fetch existing bounding boxes and categories
  useEffect(() => {
    if (!rawFrameUrl || !videoId) return;
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Get categories
        const categoryResponse = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        if (categoryResponse.ok) {
          const categoryData = await categoryResponse.json();
          if (categoryData.categories && categoryData.categories.length > 0) {
            setCategories(categoryData.categories);
            setSelectedCategory(categoryData.categories[0].id);
          }
        }
        
        // Try to get bounding boxes from pose_coordinates JSON
        try {
          const poseResponse = await fetch(`http://localhost:5000/api/annotation/get-pose-coordinates/${videoId}`);
          if (poseResponse.ok) {
            const poseData = await poseResponse.json();
            
            // Extract frame number from URL - format: 0001_pred.jpg
            const frameFileName = imageUrl.split('/').pop() || '';
            const frameNumber = frameFileName.split('_')[0]; // Get the number part (e.g., "0001")
            const frameKey = `frame_${frameNumber}`;
            
            if (poseData[frameKey] && poseData[frameKey].length > 0) {
              const boxes = poseData[frameKey].map((item: any) => ({
                x: item.bbox[0],
                y: item.bbox[1],
                width: item.bbox[2],
                height: item.bbox[3],
                label: item.label,
                category_id: getCategoryIdFromLabel(item.label, categories)
              }));
              setBoundingBoxes(boxes);
              console.log(`Loaded ${boxes.length} boxes for frame ${frameKey}`);
            }
          }
        } catch (error) {
          console.error("Failed to fetch pose coordinates, falling back to get-bbox", error);
          
          // Fallback to get-bbox if pose coordinates aren't available
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
        }
      } catch (error) {
        console.error("Failed to fetch bounding boxes:", error);
        showToast("Failed to load existing annotations", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
    // Only run this effect when rawFrameUrl or videoId change, not on every render
    // Don't include categories in the dependency array
  }, [imageUrl, videoId, rawFrameUrl]);
  
  // Helper function to get category ID from label
  const getCategoryIdFromLabel = (label: string, categories: any[]): number => {
    // Try to match the label to a category name
    const category = categories.find(cat => 
      label.toLowerCase().includes(cat.name.toLowerCase())
    );
    
    return category ? category.id : 1; // Default to 1 if no match
  };

  // Initialize canvas and draw bounding boxes
  useEffect(() => {
    if (!rawFrameUrl) return;
    
    let isMounted = true;
    const loadImage = async () => {
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

      try {
        const img = new Image();
        img.crossOrigin = "anonymous";  // Add this to handle CORS issues
        
        img.onload = () => {
          if (!isMounted) return;
          
          // Set canvas dimensions to match image
          setImageSize({ width: img.width, height: img.height });
          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw image
          ctx.drawImage(img, 0, 0);
          
          // Draw all bounding boxes
          boundingBoxes.forEach((box, index) => {
            drawBox(ctx, box, index === selectedBoxIndex);
          });
        };
        
        img.onerror = (e) => {
          if (!isMounted) return;
          console.error("Error loading image:", e);
          ctx.fillStyle = "#ffcccc";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#FF0000";
          ctx.textAlign = "center";
          ctx.fillText("Error loading image", canvas.width / 2, canvas.height / 2);
        };
        
        // Set src after setting up handlers, with cache-busting
        const timestamp = new Date().getTime();
        const urlWithCache = `${rawFrameUrl}?t=${timestamp}`;
        img.src = urlWithCache;
      } catch (error) {
        console.error("Error in canvas initialization:", error);
      }
    };
    
    loadImage();
    
    return () => {
      isMounted = false;
    };
  }, [rawFrameUrl, boundingBoxes, selectedBoxIndex]);

  // Helper function to draw a bounding box
  const drawBox = (
    ctx: CanvasRenderingContext2D,
    box: BoundingBox,
    isSelected: boolean = false
  ) => {
    // Define colors for different player categories
    const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
    const colorIndex = ((box.category_id || 1) - 1) % colors.length;
    
    // Set stroke color and width
    ctx.strokeStyle = isSelected ? "#FFFFFF" : colors[colorIndex];
    ctx.lineWidth = isSelected ? 3 : 2;
    
    // Draw the box - ensure we're using correct box format
    // COCO format: x, y, width, height
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    // Draw label background
    ctx.fillStyle = colors[colorIndex];
    const category = categories.find(c => c.id === box.category_id);
    const labelText = category ? category.name : box.label;
    const textWidth = ctx.measureText(labelText).width + 10;
    ctx.fillRect(box.x, box.y - 20, textWidth, 20);
    
    // Draw label text
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(labelText, box.x + 5, box.y - 5);
    
    // Draw selection indicators if selected
    if (isSelected) {
      // Top-left corner
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(box.x - 5, box.y - 5, 10, 10);
      
      // Top-right corner
      ctx.fillRect(box.x + box.width - 5, box.y - 5, 10, 10);
      
      // Bottom-left corner
      ctx.fillRect(box.x - 5, box.y + box.height - 5, 10, 10);
      
      // Bottom-right corner
      ctx.fillRect(box.x + box.width - 5, box.y + box.height - 5, 10, 10);
    }
  };

  // Handle mouse events for drawing and selecting boxes
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Check if clicking on an existing box
    for (let i = boundingBoxes.length - 1; i >= 0; i--) {
      const box = boundingBoxes[i];
      if (
        x >= box.x && 
        x <= box.x + box.width && 
        y >= box.y && 
        y <= box.y + box.height
      ) {
        setSelectedBoxIndex(i);
        return;
      }
    }
    
    // If not clicking on a box, start drawing a new one
    setStartPos({ x, y });
    setIsDrawing(true);
    setSelectedBoxIndex(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const width = Math.abs(x - startPos.x);
    const height = Math.abs(y - startPos.y);
    
    // Redraw all boxes plus the one being drawn
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Clear and redraw image
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = rawFrameUrl;
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        
        // Draw existing boxes
        boundingBoxes.forEach((box, index) => {
          drawBox(ctx, box, index === selectedBoxIndex);
        });
        
        // Draw new box
        const newBox = {
          x: Math.min(startPos.x, x),
          y: Math.min(startPos.y, y),
          width,
          height,
          label: categories.find(c => c.id === selectedCategory)?.name || "Player",
          category_id: selectedCategory
        };
        
        drawBox(ctx, newBox, true);
      };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) {
      setIsDrawing(false);
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Only add box if it has significant size
    const width = Math.abs(x - startPos.x);
    const height = Math.abs(y - startPos.y);
    
    if (width > 10 && height > 10) {
      const newBox = {
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
        width,
        height,
        label: categories.find(c => c.id === selectedCategory)?.name || "Player",
        category_id: selectedCategory
      };
      
      setBoundingBoxes([...boundingBoxes, newBox]);
      setSelectedBoxIndex(boundingBoxes.length);
    }
    
    setIsDrawing(false);
    setStartPos(null);
  };

  // Handle saving updated bounding boxes
  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Extract frame number from the URL - correct format: 0001_pred.jpg
      const parts = imageUrl.split('/');
      const frameFileName = parts[parts.length - 1];
      const frameNumber = frameFileName.split('_')[0]; // Get the number part (e.g., "0001")
      
      // Make sure we send only the frame number without extension
      const frameIdentifier = frameNumber.replace(/\.jpg$/, '');
      
      const response = await fetch("http://localhost:5000/api/annotation/update-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          video_id: videoId,
          frame_number: frameIdentifier,
          bboxes: boundingBoxes.map(box => ({
            // Ensure we're using COCO format: [x, y, width, height]
            bbox: [
              Math.round(box.x), 
              Math.round(box.y), 
              Math.round(box.width), 
              Math.round(box.height)
            ],
            label: box.label,
            category_id: box.category_id,
            confidence: 1.0 // Manual annotations get full confidence
          }))
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save annotations");
      }
      
      showToast("Bounding boxes saved successfully", "success");
      
      // Wait before completing to allow backend to process
      setTimeout(() => {
        onSaveComplete();
      }, 2000);
    } catch (error) {
      console.error("Failed to save annotations:", error);
      showToast("Failed to save annotations", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete selected bounding box
  const handleDeleteSelected = () => {
    if (selectedBoxIndex === null) return;
    
    setBoundingBoxes(boxes => 
      boxes.filter((_, index) => index !== selectedBoxIndex)
    );
    setSelectedBoxIndex(null);
  };

  // Change category of selected bounding box
  const handleChangeCategory = (categoryId: number) => {
    if (selectedBoxIndex === null) return;
    
    setBoundingBoxes(boxes => 
      boxes.map((box, index) => 
        index === selectedBoxIndex 
          ? { 
              ...box, 
              category_id: categoryId,
              label: categories.find(c => c.id === categoryId)?.name || box.label 
            } 
          : box
      )
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-4xl mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Edit Bounding Boxes</h3>
          <div className="flex gap-2">
            {categories.map(category => (
              <button
                key={category.id}
                className={`btn btn-sm ${
                  selectedCategory === category.id ? 'btn-primary' : 'btn-outline'
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="bg-base-300 p-2 rounded-lg">
          <canvas
            ref={canvasRef}
            className="w-full cursor-crosshair rounded-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          ></canvas>
        </div>
      </div>
      
      <div className="flex gap-4 mb-4">
        {selectedBoxIndex !== null && (
          <>
            <div className="flex items-center gap-2">
              <span>Player:</span>
              <select
                className="select select-bordered select-sm"
                value={boundingBoxes[selectedBoxIndex]?.category_id}
                onChange={(e) => handleChangeCategory(Number(e.target.value))}
              >
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              className="btn btn-sm btn-error"
              onClick={handleDeleteSelected}
            >
              Delete Box
            </button>
          </>
        )}
        
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
      
      <div className="alert alert-info w-full max-w-4xl">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <h3 className="font-bold">Bounding Box Editor</h3>
          <ul className="list-disc list-inside text-sm mt-1">
            <li>Click and drag to create a new bounding box</li>
            <li>Click on an existing box to select it</li>
            <li>Use the buttons to change player or delete a selected box</li>
            <li>Click "Save Changes" when done editing</li>
            <li>After saving, pose visualization will be regenerated</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BoundingBoxEditor;