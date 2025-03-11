import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../../hooks";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  category_id: number;
}

interface Category {
  id: number;
  name: string;
  supercategory: string;
}

interface BoundingBoxAnnotatorProps {
  imageUrl: string;
  videoId: string;
  isAnnotating: boolean;
  setIsAnnotating: (isAnnotating: boolean) => void;
  onSaveComplete?: () => void;
}

const BoundingBoxAnnotator: React.FC<BoundingBoxAnnotatorProps> = ({
  imageUrl,
  videoId,
  isAnnotating,
  setIsAnnotating,
  onSaveComplete
}) => {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [frameId, setFrameId] = useState<string>("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useToast();
  
  // Extract frame ID from image URL
  useEffect(() => {
    if (!imageUrl) return;
    
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1];
    setFrameId(filename.split('.')[0]);
  }, [imageUrl]);
  
  // Load categories and existing boxes when component mounts
  useEffect(() => {
    if (!videoId) return;
    
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Load categories
        const categoriesResponse = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        if (categoriesResponse.ok) {
          const data = await categoriesResponse.json();
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
            setSelectedCategoryId(data.categories[0].id);
          }
        }
        
        // Load boxes for this specific frame
        if (frameId) {
          const boxesResponse = await fetch(`http://localhost:5000/api/annotation/get-frame/${videoId}/${frameId}`);
          if (boxesResponse.ok) {
            const data = await boxesResponse.json();
            if (data.annotations && data.annotations.length > 0) {
              const boxes = data.annotations.map((ann: any) => ({
                x: ann.bbox[0],
                y: ann.bbox[1],
                width: ann.bbox[2],
                height: ann.bbox[3],
                category_id: ann.category_id,
                label: categories.find(c => c.id === ann.category_id)?.name || `Player ${ann.category_id}`
              }));
              setBoundingBoxes(boxes);
            }
          }
        }
      } catch (error) {
        console.error('Error loading annotation data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [videoId, frameId, categories.length]);
  
  // Update box labels when categories change
  useEffect(() => {
    if (categories.length > 0 && boundingBoxes.length > 0) {
      setBoundingBoxes(prevBoxes => 
        prevBoxes.map(box => ({
          ...box,
          label: categories.find(c => c.id === box.category_id)?.name || box.label
        }))
      );
    }
  }, [categories]);

  // Set up canvas and draw the current state
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
      
      // Draw image
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // Draw all bounding boxes
      boundingBoxes.forEach(box => {
        const category = categories.find(c => c.id === box.category_id);
        // Color based on category ID
        const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
        const colorIndex = (box.category_id - 1) % colors.length;
        
        ctx.strokeStyle = colors[colorIndex];
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw label background
        ctx.fillStyle = colors[colorIndex];
        const labelText = category?.name || `Player ${box.category_id}`;
        const textWidth = ctx.measureText(labelText).width + 10;
        ctx.fillRect(box.x, box.y - 20, textWidth, 20);
        
        // Draw label text
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.fillText(labelText, box.x + 5, box.y - 5);
      });
      
      // Draw current box being created
      if (currentBox) {
        const colorIndex = selectedCategoryId ? (selectedCategoryId - 1) % 4 : 0;
        const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
        
        ctx.strokeStyle = colors[colorIndex];
        ctx.lineWidth = 2;
        ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
      }
      
      // Draw crosshair at mouse position
      if (mousePos && isAnnotating) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(mousePos.x, 0);
        ctx.lineTo(mousePos.x, canvas.height);
        ctx.stroke();
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(0, mousePos.y);
        ctx.lineTo(canvas.width, mousePos.y);
        ctx.stroke();
      }
    };
  }, [imageUrl, boundingBoxes, currentBox, mousePos, categories, isAnnotating, selectedCategoryId]);
  
  // Mouse event handlers for drawing boxes
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isAnnotating || !selectedCategoryId) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setStartPos({ x, y });
    setIsDrawing(true);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setMousePos({ x, y });
    
    if (isDrawing && startPos && selectedCategoryId) {
      const category = categories.find(c => c.id === selectedCategoryId);
      setCurrentBox({
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
        width: Math.abs(x - startPos.x),
        height: Math.abs(y - startPos.y),
        category_id: selectedCategoryId,
        label: category?.name || `Player ${selectedCategoryId}`
      });
    }
  };
  
  const handleMouseUp = () => {
    if (!isAnnotating || !isDrawing || !startPos || !currentBox) return;
    
    // Only add box if it has significant size
    if (currentBox.width > 5 && currentBox.height > 5) {
      setBoundingBoxes(prev => [...prev, currentBox]);
    }
    
    setIsDrawing(false);
    setStartPos(null);
    setCurrentBox(null);
  };
  
  // Save annotations for the current frame
  const handleSaveAnnotations = async () => {
    if (!videoId || !frameId || boundingBoxes.length === 0) {
      showToast("No annotations to save", "warning");
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Convert boxes to COCO annotation format
      const annotations = boundingBoxes.map((box, index) => ({
        id: index + 1,
        image_id: frameId,
        category_id: box.category_id,
        bbox: [box.x, box.y, box.width, box.height],
        area: box.width * box.height,
        iscrowd: 0
      }));
      
      const response = await fetch(`http://localhost:5000/api/annotation/save-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          frame_id: frameId,
          annotations: annotations,
          width: imageSize.width,
          height: imageSize.height
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to save annotations");
      }
      
      showToast("Annotations saved successfully", "success");
      setIsAnnotating(false);
      if (onSaveComplete) onSaveComplete();
      
    } catch (error) {
      console.error("Error saving annotations:", error);
      showToast("Failed to save annotations", "error");
    } finally {
      setIsSaving(false);
    }
  };
  
  // Delete a specific box
  const handleDeleteBox = (index: number) => {
    setBoundingBoxes(prev => prev.filter((_, i) => i !== index));
  };
  
  // Cancel annotation mode
  const handleCancel = () => {
    setIsAnnotating(false);
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-4">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }
  
  return (
    <div className="w-full">
      {/* Player selection buttons (categories) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(category => {
          // Color based on category ID
          const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
          const colorIndex = (category.id - 1) % colors.length;
          
          return (
            <button
              key={category.id}
              className={`btn ${selectedCategoryId === category.id ? 'btn-active' : 'btn-outline'}`}
              style={{
                backgroundColor: selectedCategoryId === category.id ? colors[colorIndex] : 'transparent',
                borderColor: colors[colorIndex],
                color: selectedCategoryId === category.id ? 'white' : colors[colorIndex]
              }}
              onClick={() => setSelectedCategoryId(category.id)}
              disabled={!isAnnotating}
            >
              {category.name}
            </button>
          );
        })}
      </div>
      
      {/* Canvas for drawing */}
      <div className="relative w-full bg-base-300 p-2 rounded-lg shadow-inner flex justify-center mb-4">
        <canvas
          ref={canvasRef}
          className="max-w-full h-auto rounded border border-base-content/20"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      
      {/* Annotation controls */}
      {isAnnotating && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card bg-base-200 p-4">
            <h4 className="font-semibold mb-2">Instructions</h4>
            <ul className="text-sm space-y-1 list-disc pl-5">
              <li>Select a player category from the buttons above</li>
              <li>Click and drag to draw a bounding box</li>
              <li>Draw one box for each player visible in the frame</li>
              <li>Click Save when done with this frame</li>
            </ul>
            
            <div className="flex justify-between mt-4">
              <button 
                className="btn btn-error"
                onClick={handleCancel}
              >
                Cancel
              </button>
              
              <button 
                className="btn btn-success"
                onClick={handleSaveAnnotations}
                disabled={isSaving || boundingBoxes.length === 0}
              >
                {isSaving ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Saving...
                  </>
                ) : 'Save Annotations'}
              </button>
            </div>
          </div>
          
          <div className="card bg-base-200 p-4">
            <h4 className="font-semibold mb-2">Current Annotations</h4>
            {boundingBoxes.length > 0 ? (
              <div className="overflow-y-auto max-h-40">
                <ul className="menu bg-base-100 rounded-box">
                  {boundingBoxes.map((box, index) => {
                    const category = categories.find(c => c.id === box.category_id);
                    const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];
                    const colorIndex = (box.category_id - 1) % colors.length;
                    
                    return (
                      <li key={index} className="border-b border-base-300 last:border-0">
                        <div className="flex justify-between items-center p-2">
                          <div className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: colors[colorIndex] }}
                            ></div>
                            <span>{category?.name || `Player ${box.category_id}`}</span>
                          </div>
                          <button 
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleDeleteBox(index)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="text-center py-4 text-base-content/50">
                No annotations yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BoundingBoxAnnotator;