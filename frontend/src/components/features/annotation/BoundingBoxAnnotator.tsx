import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../../hooks";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface Player {
  id: number;
  description: string;
  color: string;
}

interface BoundingBoxAnnotatorProps {
  imageUrl: string;  
  isAnnotating: boolean;
  setIsAnnotating: (isAnnotating: boolean) => void;
}

const BoundingBoxAnnotator: React.FC<BoundingBoxAnnotatorProps> = ({ 
  imageUrl, 
  isAnnotating, 
  setIsAnnotating 
}) => {
  // State for bounding boxes
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  // State for player descriptions and selection
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, description: "", color: "#FF5555" },
    { id: 2, description: "", color: "#55FF55" },
    { id: 3, description: "", color: "#5555FF" },
    { id: 4, description: "", color: "#FFAA00" }
  ]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [descriptionsConfirmed, setDescriptionsConfirmed] = useState(false);
  
  // Save and load state
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useToast();

  // Reset bounding boxes when the image changes
  useEffect(() => {
    // Try to load existing annotations for this image
    loadAnnotations();
    setHasUnsavedChanges(false);
  }, [imageUrl]);

  // Set up the canvas and draw the image and boxes
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

  // Load existing annotations for the current image
  const loadAnnotations = async () => {
    try {
      // Extract frame ID from the image URL
      const frameIdMatch = imageUrl.match(/\/frame\/([^/]+)$/);
      if (!frameIdMatch) return;
      
      const frameId = frameIdMatch[1];
      const response = await fetch(`http://localhost:5000/api/annotation/get?frame_id=${frameId}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.annotations && data.annotations.length > 0) {
          setBoundingBoxes(data.annotations);
          
          // Also load player descriptions if available
          if (data.players && data.players.length === 4) {
            setPlayers(prevPlayers => 
              prevPlayers.map((player, idx) => ({
                ...player,
                description: data.players[idx].description || player.description
              }))
            );
            
            // If we have descriptions, set them as confirmed
            if (data.players.every((p: any) => p.description)) {
              setDescriptionsConfirmed(true);
              setSelectedPlayerId(data.players[0].id);
            }
          }
          
          showToast('Loaded existing annotations', 'info');
        }
      }
    } catch (error) {
      console.error('Error loading annotations:', error);
      // Not showing an error toast as this is a background operation
    }
  };

  // Draw bounding boxes on the canvas
  const drawBoundingBoxes = (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw saved bounding boxes
    boundingBoxes.forEach((box) => {
      // Find the player to get the color
      const player = players.find(p => p.description === box.label);
      const boxColor = player?.color || "#FF0000";
      
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Draw label background
      ctx.fillStyle = boxColor;
      const textMetrics = ctx.measureText(box.label);
      const textWidth = textMetrics.width + 8;
      const textHeight = 20;
      ctx.fillRect(box.x, box.y - textHeight, textWidth, textHeight);
      
      // Draw label text
      ctx.fillStyle = "white";
      ctx.font = "14px Arial";
      ctx.fillText(box.label, box.x + 4, box.y - 6);
    });

    // Draw real-time bounding box while dragging
    if (currentBox && selectedPlayerId) {
      const player = players.find(p => p.id === selectedPlayerId);
      ctx.strokeStyle = player?.color || "#3498db";
      ctx.lineWidth = 2;
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
    }
    
    // Draw crosshair at mouse position
    if (mousePos) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
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

  // Handle mouse down to start drawing a box
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isAnnotating || !descriptionsConfirmed || !selectedPlayerId) return;

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

  // Handle mouse move to update the current box
  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setMousePos({ x, y });

    if (isDrawing && startPos && selectedPlayerId) {
      const player = players.find(p => p.id === selectedPlayerId);
      
      setCurrentBox({
        x: Math.min(startPos.x, x),
        y: Math.min(startPos.y, y),
        width: Math.abs(x - startPos.x),
        height: Math.abs(y - startPos.y),
        label: player?.description || "Unknown",
      });
    }
  };

  // Handle mouse up to finish drawing a box
  const handleMouseUp = () => {
    if (!isAnnotating || !isDrawing || !startPos || !currentBox || !selectedPlayerId) return;

    // Only add the box if it has significant size
    if (currentBox.width > 5 && currentBox.height > 5) {
      setBoundingBoxes((prev) => [...prev, currentBox]);
      setHasUnsavedChanges(true);
    }
    
    setIsDrawing(false);
    setStartPos(null);
    setCurrentBox(null);
  };

  // Handle player description change
  const handleDescriptionChange = (id: number, value: string) => {
    setPlayers(prev => 
      prev.map(player => 
        player.id === id ? { ...player, description: value } : player
      )
    );
  };

  // Confirm player descriptions to begin annotating
  const confirmDescriptions = () => {
    const emptyDescriptions = players.filter(p => p.description.trim() === "");
    
    if (emptyDescriptions.length > 0) {
      showToast("Please provide descriptions for all four players.", "error");
      return;
    }
    
    // Check for duplicate descriptions
    const descriptions = players.map(p => p.description.trim());
    const uniqueDescriptions = new Set(descriptions);
    
    if (uniqueDescriptions.size !== descriptions.length) {
      showToast("Each player must have a unique description.", "error");
      return;
    }
    
    setDescriptionsConfirmed(true);
    setSelectedPlayerId(players[0].id); // Select first player by default
    showToast("Players confirmed. Start drawing bounding boxes.", "success");
  };

  // Reset player descriptions
  const resetDescriptions = () => {
    setDescriptionsConfirmed(false);
    setSelectedPlayerId(null);
    setBoundingBoxes([]);
    setHasUnsavedChanges(true);
  };

  // Select a player for annotation
  const selectPlayer = (id: number) => {
    setSelectedPlayerId(id);
  };

  // Save annotations to the backend
  const handleSave = async () => {
    if (!imageUrl || boundingBoxes.length === 0) {
      showToast("No annotations to save!", "warning");
      return;
    }
    
    try {
      setIsSaving(true);
      
      // Extract frame ID from the image URL
      const frameIdMatch = imageUrl.match(/\/frame\/([^/]+)$/);
      if (!frameIdMatch) {
        throw new Error("Could not determine frame ID from URL");
      }
      
      const frameId = frameIdMatch[1];
      
      const response = await fetch("http://localhost:5000/api/annotation/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          frame_id: frameId,
          image_url: imageUrl, 
          bounding_boxes: boundingBoxes, 
          width: imageSize.width, 
          height: imageSize.height,
          players: players
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save annotations");
      }
      
      setHasUnsavedChanges(false);
      setIsAnnotating(false);
      showToast("Annotations saved successfully!", "success");
    } catch (error) {
      console.error("Error saving annotations:", error);
      showToast("Failed to save annotations. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete the selected annotation box
  const deleteSelectedBox = (index: number) => {
    setBoundingBoxes(prevBoxes => prevBoxes.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  return (
    <div className="p-4">
      <h3 className="text-lg font-bold mb-4">
        {isAnnotating ? "Annotate Tennis Players" : "View Tennis Player Annotations"}
      </h3>
      
      {!descriptionsConfirmed ? (
        <div className="card bg-base-100 shadow-lg p-4">
          <h4 className="font-semibold mb-3">Enter player descriptions before annotating:</h4>
          <p className="text-sm text-base-content/70 mb-4">
            Describe each tennis player with unique identifiers like "Player in red shirt", 
            "Player with blue headband", etc.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {players.map((player) => (
              <div 
                key={player.id} 
                className="form-control"
                style={{ borderLeft: `4px solid ${player.color}`, paddingLeft: '12px' }}
              >
                <label className="label">
                  <span className="label-text">Player {player.id}</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  placeholder={`e.g., Player in red shirt`}
                  value={player.description}
                  onChange={(e) => handleDescriptionChange(player.id, e.target.value)}
                />
              </div>
            ))}
          </div>
          
          <div className="mt-4">
            <button className="btn btn-primary" onClick={confirmDescriptions}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Confirm & Start Annotating
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Player selection buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {players.map((player) => (
              <button
                key={player.id}
                className={`btn ${selectedPlayerId === player.id ? 'btn-active' : 'btn-outline'}`}
                style={{ 
                  backgroundColor: selectedPlayerId === player.id ? player.color : 'transparent',
                  borderColor: player.color,
                  color: selectedPlayerId === player.id ? 'white' : player.color
                }}
                onClick={() => selectPlayer(player.id)}
              >
                {player.description}
              </button>
            ))}
            
            <button 
              className="btn btn-outline btn-error ml-auto" 
              onClick={resetDescriptions}
            >
              Reset Players
            </button>
          </div>
          
          {/* Canvas with annotations */}
          <div className="relative w-full bg-base-300 p-2 rounded-lg shadow-inner flex justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto rounded border border-base-content/20"
              onMouseDown={isAnnotating ? handleMouseDown : undefined}
              onMouseMove={handleMouseMove}
              onMouseUp={isAnnotating ? handleMouseUp : undefined}
              onMouseLeave={isAnnotating ? handleMouseUp : undefined}
            />
          </div>
          
          {/* Controls and annotation list */}
          <div className="mt-4 flex flex-col md:flex-row gap-4">
            <div className="card bg-base-200 p-4 flex-1">
              <h4 className="font-semibold mb-2">Instructions</h4>
              {isAnnotating ? (
                <ul className="text-sm space-y-1 list-disc pl-5">
                  <li>Select a player from the buttons above</li>
                  <li>Click and drag to draw a bounding box</li>
                  <li>Draw boxes around each player in the scene</li>
                  <li>Click "Save Annotations" when done</li>
                </ul>
              ) : (
                <p className="text-sm">
                  Click "Start Annotating" to begin marking tennis players in this frame.
                </p>
              )}
              
              <div className="flex justify-between mt-4">
                <button 
                  className={`btn ${isAnnotating ? 'btn-error' : 'btn-primary'}`}
                  onClick={() => setIsAnnotating(!isAnnotating)}
                >
                  {isAnnotating ? 'Cancel Annotating' : 'Start Annotating'}
                </button>
                
                <button 
                  className="btn btn-success"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isSaving || boundingBoxes.length === 0}
                >
                  {isSaving ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      Saving...
                    </>
                  ) : (
                    'Save Annotations'
                  )}
                </button>
              </div>
            </div>
            
            <div className="card bg-base-200 p-4 flex-1">
              <h4 className="font-semibold mb-2">Current Annotations</h4>
              {boundingBoxes.length > 0 ? (
                <div className="overflow-y-auto max-h-40">
                  <ul className="menu bg-base-100 rounded-box">
                    {boundingBoxes.map((box, index) => {
                      const player = players.find(p => p.description === box.label);
                      return (
                        <li key={index} className="border-b border-base-300 last:border-0">
                          <div className="flex justify-between items-center p-2">
                            <div className="flex items-center">
                              <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: player?.color || 'gray' }}></div>
                              <span>{box.label}</span>
                            </div>
                            {isAnnotating && (
                              <button 
                                className="btn btn-ghost btn-xs"
                                onClick={() => deleteSelectedBox(index)}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
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
        </>
      )}
    </div>
  );
};

export default BoundingBoxAnnotator;