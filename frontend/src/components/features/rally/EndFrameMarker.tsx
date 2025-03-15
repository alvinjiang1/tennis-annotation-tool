import React, { useEffect, useRef, useState } from "react";
import { useToast } from "../../../hooks";

interface EndFrameMarkerProps {
  imageUrl: string;
  videoId: string;
  onMarkEndFrame: (endFrame: number, ballPosition: { x: number, y: number }) => void;
  frameNumber: number;
}

const EndFrameMarker: React.FC<EndFrameMarkerProps> = ({
  imageUrl,
  videoId,
  onMarkEndFrame,
  frameNumber
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [imageSize, setImageSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [rawFrameUrl, setRawFrameUrl] = useState<string>("");
  const [ballPosition, setBallPosition] = useState<{ x: number, y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { showToast } = useToast();

  // Generate raw frame URL
  useEffect(() => {
    
    if (!imageUrl || !videoId) return;    
    try {
      const parts = imageUrl.split("/");
      const frameFileName = parts[parts.length - 1];
      const frameNumberPart = frameFileName.split("_")[0]; // Extract frame number

      const rawUrl = `http://localhost:5000/api/video/frame/${videoId}/${frameNumberPart}.jpg`;
      setRawFrameUrl(rawUrl);
      console.log("Using raw frame URL:", rawUrl)
    } catch (error) {
      console.error("Error creating raw frame URL:", error);
      setRawFrameUrl(imageUrl);
    }
  }, [imageUrl, videoId]);

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

      setIsLoading(false);
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

  // Resize the canvas based on container size
  useEffect(() => {
    if (!imageSize.width || !imageSize.height) return;    

    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const aspectRatio = imageSize.width / imageSize.height;
        const newWidth = containerWidth;
        const newHeight = containerWidth / aspectRatio;

        setCanvasSize({ width: newWidth, height: newHeight });
      }
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [imageSize]);

  // Handle click to mark ball position
  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleX = imageSize.width / canvasSize.width;
    const scaleY = imageSize.height / canvasSize.height;

    const imageX = mouseX * scaleX;
    const imageY = mouseY * scaleY;

    setBallPosition({ x: imageX, y: imageY });

    // Send end frame data to parent
    onMarkEndFrame(frameNumber, { x: imageX, y: imageY });
    showToast(`Ball position set at X: ${Math.round(imageX)}, Y: ${Math.round(imageY)}`, "success");    
  };

  // Draw the image and ball position
  useEffect(() => {
    if (!canvasSize.width || !canvasSize.height) return;
    if (!imageSize.width || !imageSize.height) return;
    if (!canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const scaleX = canvasSize.width / imageSize.width;
    const scaleY = canvasSize.height / imageSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);    
    ctx.drawImage(imgRef.current, 0, 0, canvasSize.width, canvasSize.height);

    if (ballPosition) {
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(ballPosition.x * scaleX, ballPosition.y * scaleY, 8, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [canvasSize, imageSize, ballPosition, imgRef.current?.complete]);

  return (
    <div ref={containerRef} className="relative w-full">
      <img ref={imgRef} style={{ display: "none" }} alt="hidden reference" />
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
          style={{ width: canvasSize.width, height: canvasSize.height, maxWidth: "100%" }}
          onClick={handleClick}
        />
      </div>
      )}

      {ballPosition && (
        <div className="absolute top-2 right-2 bg-success text-white p-2 rounded shadow-lg">
          Ball Marked at ({Math.round(ballPosition.x)}, {Math.round(ballPosition.y)})
        </div>
      )}
    </div>
  );
};

export default EndFrameMarker;
