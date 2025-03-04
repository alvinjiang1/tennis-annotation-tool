import { BoundingBox } from './features/annotation/BoundingBoxAnnotator';

export const fetchBoundingBoxes = async (imageUrl: string, setBoundingBoxes: (boxes: BoundingBox[]) => void) => {
  try {
    const response = await fetch("http://localhost:5000/api/annotation/get-bbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Inference Failed: ${data.error}`);
    }
    const bboxData = data || [];
    const boundingBoxes: BoundingBox[] = bboxData.map((box: any) => ({
      x: box.bbox[0],
      y: box.bbox[1],
      width: box.bbox[2],
      height: box.bbox[3],
      label: box.label,
      category_id: box.category_id || 1 // Default to 1 if not provided
    }));
    setBoundingBoxes(boundingBoxes);
  } catch (error) {
    console.error("Failed to fetch bounding boxes:", error);
  }
};

export const saveBoundingBoxes = async (imageUrl: string, boundingBoxes: BoundingBox[]) => {
  try {
    const response = await fetch("http://localhost:5000/api/annotation/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          image_url: imageUrl,            
          bboxes: boundingBoxes.map((box) => box)}),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save annotations');
    }
    
    return true;
  } catch (error) {
    console.error("Failed to save annotations:", error);
    throw error;
  }
};

export const saveHittingMoments = async (selectedRallyFrames: { [key: string]: string[] }) => {
  try {
    await fetch("http://localhost:5000/api/annotation/save-hitting-moments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hitting_moments: selectedRallyFrames }),
    });
    return true;
  } catch (error) {
    console.error("Failed to save hitting moments:", error);
    throw error;
  }
};

/**
 * The functions below help in the drawing of Bounding Boxes.
 */
export const convertToXYWH = (box: BoundingBox): BoundingBox => {
  return {
    x: box.x,
    y: box.y,
    width: box.width - box.x,
    height: box.height - box.y,
    label: box.label,
    category_id: box.category_id // Include the category_id
  };
};

export const convertToX1Y1X2Y2 = (box: BoundingBox): BoundingBox => {
  return {
    x: box.x,
    y: box.y,
    width: box.x + box.width,
    height: box.y + box.height,
    label: box.label,
    category_id: box.category_id // Include the category_id
  };
};

export const drawBoundingBoxes = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boundingBoxes: BoundingBox[],
  currentBox: BoundingBox | null,
  mousePos: { x: number; y: number } | null,
  transform: boolean = false
) => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(img, 0, 0);

  // Define colors for different player categories
  const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];

  boundingBoxes.forEach((box) => {
    const boxToDraw = transform ? convertToXYWH(box) : box;
    
    // Choose color based on category_id (1-indexed)
    const colorIndex = ((box.category_id || 1) - 1) % colors.length;
    const boxColor = colors[colorIndex];
    
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxToDraw.x, boxToDraw.y, boxToDraw.width, boxToDraw.height);
    
    // Draw label background
    ctx.fillStyle = boxColor;
    const labelWidth = ctx.measureText(box.label).width + 8;
    ctx.fillRect(boxToDraw.x, boxToDraw.y - 20, labelWidth, 20);
    
    // Draw label
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(boxToDraw.label, boxToDraw.x + 4, boxToDraw.y - 6);
  });

  if (currentBox) {
    const boxToDraw = transform ? convertToXYWH(currentBox) : currentBox;
    
    // Choose color based on category_id (1-indexed)
    const colorIndex = ((currentBox.category_id || 1) - 1) % colors.length;
    const boxColor = colors[colorIndex];
    
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxToDraw.x, boxToDraw.y, boxToDraw.width, boxToDraw.height);
  }

  if (mousePos) {
    ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(mousePos.x, 0);
    ctx.lineTo(mousePos.x, ctx.canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, mousePos.y);
    ctx.lineTo(ctx.canvas.width, mousePos.y);
    ctx.stroke();
  }
};