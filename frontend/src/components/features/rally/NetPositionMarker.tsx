import React, { useEffect, useRef, useState } from "react";

interface NetPositionMarkerProps {
  imageUrl: string;
  onSetNetPosition: (position: { x: number; y: number }) => void;
  initialPosition: { x: number; y: number } | null;
}

const NetPositionMarker: React.FC<NetPositionMarkerProps> = ({
  imageUrl,
  onSetNetPosition,
  initialPosition
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [netPosition, setNetPosition] = useState<{ x: number, y: number } | null>(initialPosition);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Force redraw on initial render even if image is cached
  useEffect(() => {
    // First attempt to draw with a tiny timeout to handle cached images
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        setImageLoaded(true);
        setLoadingError(null);
        
        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;
        setImageSize({ width: img.width, height: img.height });
        
        // Draw image
        ctx.drawImage(img, 0, 0);
        
        // Draw initial net position if available
        if (netPosition) {
          drawNetLine(ctx, netPosition.y);
        } else if (initialPosition) {
          // Use initial position from props if available
          setNetPosition(initialPosition);
          drawNetLine(ctx, initialPosition.y);
        } else {
          // Default to center of image if no position is provided
          const defaultY = canvas.height / 2;
          setNetPosition({ x: 0, y: defaultY });
          drawNetLine(ctx, defaultY);
        }
      };
      
      img.onerror = (e) => {
        console.error("Error loading image:", e);
        setImageLoaded(false);
        setLoadingError("Could not load image. Please try again.");
      };
      
      // Add a cache-busting query parameter to force a fresh load
      img.src = `${imageUrl}?t=${new Date().getTime()}`;
    }, 50);
    
    return () => clearTimeout(timer);
  }, [imageUrl]);

  // Helper function to draw the net line
  const drawNetLine = (ctx: CanvasRenderingContext2D, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Draw net line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.strokeStyle = "rgba(255, 0, 0, 0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Add instructions text
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(10, 10, 500, 30);
    ctx.fillStyle = "#000";
    ctx.font = "16px Arial";
    ctx.fillText("Click and drag horizontally to position the net line. Click 'Set' when done.", 20, 30);
  };

  // Handle mouse events for drawing the net line
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    
    const y = (e.clientY - rect.top) * scaleY;
    setNetPosition({ x: 0, y });
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Redraw the image first
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        drawNetLine(ctx, y);
      };
      
      img.src = imageUrl;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    
    const y = (e.clientY - rect.top) * scaleY;
    setNetPosition({ x: 0, y });
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Redraw the image first
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        drawNetLine(ctx, y);
      };
      
      img.src = imageUrl;
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleConfirmNetPosition = () => {
    if (netPosition) {
      onSetNetPosition(netPosition);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-4">
        {!imageLoaded && !loadingError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-200 z-10 rounded-lg">
            <div className="loading loading-spinner loading-lg mb-2"></div>
            <p>Loading image...</p>
          </div>
        )}
        
        {loadingError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-error bg-opacity-20 z-10 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-error mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-error font-medium">{loadingError}</p>
            <button 
              className="btn btn-sm btn-error mt-2"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          className="border rounded-lg cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          width={imageSize.width || 1280}
          height={imageSize.height || 720}
        ></canvas>
      </div>
      
      <div className="flex gap-4">
        <button
          className="btn btn-primary"
          onClick={handleConfirmNetPosition}
          disabled={!netPosition}
        >
          Set Net Position
        </button>
      </div>
      
      <div className="alert alert-info mt-4">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <h3 className="font-bold">Setting the Net Position</h3>
          <div className="text-sm">Click and drag to position the horizontal net line. 
          This helps establish the court orientation for all rally analysis.</div>
        </div>
      </div>
    </div>
  );
};

export default NetPositionMarker;