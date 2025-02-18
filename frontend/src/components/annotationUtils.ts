import { BoundingBox } from './BoundingBoxAnnotator'

interface HittingMoments {
}

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
    }));
    setBoundingBoxes(boundingBoxes);
  } catch (error) {
    console.error("Failed to fetch bounding boxes:", error);
  }
};

export const saveBoundingBoxes = async (imageUrl: string, boundingBoxes: BoundingBox[]) => {
  try {
    await fetch("http://localhost:5000/api/annotation/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          image_url: imageUrl,            
          bboxes: boundingBoxes.map((box) => box)}),
    });
    alert("Bounding Boxes Updated Successfully!");
  } catch (error) {
    console.error("Failed to save annotations:", error);
  }
};

export const saveHittingMoments = async (selectedRallyFrames: HittingMoments) => {
  try {
    await fetch("http://localhost:5000/api/annotations/save-hitting-moments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hittingMoments: selectedRallyFrames }),
    });
    alert("Hitting Moments Saved Successfully!");
  } catch (error) {
    console.error("Failed to save hitting moments:", error);
  }
};

/**
 * The functions below are help in the drawing of Bounding Boxes.
 */
export const convertToXYWH = (box: BoundingBox) => {
  return {
    x: box.x,
    y: box.y,
    width: box.width - box.x,
    height: box.height - box.y,
    label: box.label,
  };
};

export const convertToX1Y1X2Y2 = (box: BoundingBox) => {
  return {
    x: box.x,
    y: box.y,
    width: box.x + box.width,
    height: box.y + box.height,
    label: box.label,
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

  boundingBoxes.forEach((box) => {
    if (transform) {
      box = convertToXYWH(box);      
    }
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = "red";
    ctx.font = "14px Arial";
    ctx.fillText(box.label, box.x + 4, box.y + 12);
  });

  if (currentBox) {
    if (transform) {
      currentBox = convertToXYWH(currentBox);
    }
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
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

