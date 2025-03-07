import cv2
import json
import os
from pathlib import Path
import numpy as np
from ultralytics import YOLO

class TennisPlayerAnalyzer:
    def __init__(self, frames_dir, bbox_file, yolo_model_path="models/yolo11x-pose.pt"):
        self.frames_dir = Path(frames_dir)
        self.bbox_file = Path(bbox_file)
        self.predictions = self.load_predictions()
        self.model = YOLO(yolo_model_path)
        self.scale_factor = 1.8
        
    def load_predictions(self):
        try:
            with open(self.bbox_file, 'r') as f:
                bbox_data = json.load(f)
                
            # Debug the loaded data
            print(f"Loaded predictions from {self.bbox_file}")
            print(f"Frames with predictions: {list(bbox_data.keys())}")
            for frame, predictions in bbox_data.items():
                print(f"Frame {frame}: {len(predictions)} predictions")
                
            return bbox_data
        except Exception as e:
            print(f"Error loading predictions: {str(e)}")
            return {}
    
    def expand_bbox(self, bbox):
        x1, y1, x2, y2 = bbox
        
        # Convert to int to ensure valid coordinates
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
        
        # Calculate center and dimensions
        w = x2 - x1
        h = y2 - y1
        x_center = (x1 + x2) / 2
        y_center = (y1 + y2) / 2
        
        # Calculate new dimensions
        new_w = w * self.scale_factor
        new_h = h * self.scale_factor
        
        # Calculate new coordinates
        x1_new = max(0, int(x_center - new_w/2))
        y1_new = max(0, int(y_center - new_h/2))
        x2_new = int(x_center + new_w/2)
        y2_new = int(y_center + new_h/2)
        
        # Debug the expansion
        print(f"Expanding bbox from [{x1}, {y1}, {x2}, {y2}] to [{x1_new}, {y1_new}, {x2_new}, {y2_new}]")
        
        return [x1_new, y1_new, x2_new, y2_new]
    
    def process_pose_keypoints(self, pose_results):
        try:
            keypoints = np.zeros((17, 2), dtype=np.float32)
            confidence = np.zeros(17, dtype=np.float32)
            
            if len(pose_results) > 0:
                kpts = pose_results[0].keypoints  # Take first detection only
                if len(kpts) > 0:
                    keypoints = kpts.xy.cpu().numpy()[0][:17, :2]
                    confidence = kpts.conf.cpu().numpy()[0][:17] if kpts.conf is not None else np.ones(17)
            
            return keypoints, confidence
        except Exception as e:
            print(f"Error processing pose keypoints: {str(e)}")
            return np.zeros((17, 2), dtype=np.float32), np.zeros(17, dtype=np.float32)

    def draw_bbox(self, frame, bbox, confidence, label):
        x1, y1, x2, y2 = bbox
        color = (0, 255, 0)  # Consistent green color for all bboxes
        
        # Draw rectangle using cv2.rectangle which expects top-left and bottom-right coordinates
        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
        
        # Add label with confidence
        display_label = f"{label} ({confidence:.2f})"
        
        # Add text above the box
        cv2.putText(
            frame,
            display_label,
            (int(x1), int(y1) - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2
        )

    def draw_pose(self, frame, keypoints, label):
        if len(keypoints) == 0:
            return

        left_indices = {5, 7, 9, 11, 13, 15}
        right_indices = {6, 8, 10, 12, 14, 16}
        center_indices = {0, 1, 2, 3, 4}

        skeleton = [
            (0, 1), (0, 2), (1, 3), (2, 4),  # Face
            (5, 6), (5, 11), (6, 12), (11, 12),  # Body
            (5, 7), (7, 9),  # Left arm
            (6, 8), (8, 10),  # Right arm
            (11, 13), (13, 15),  # Left leg
            (12, 14), (14, 16)  # Right leg
        ]

        BLUE = (255, 0, 0)
        RED = (0, 0, 255)
        GREEN = (0, 255, 0)

        for p1, p2 in skeleton:
            if (p1 < len(keypoints) and p2 < len(keypoints) and 
                keypoints[p1][0] > 0 and keypoints[p1][1] > 0 and 
                keypoints[p2][0] > 0 and keypoints[p2][1] > 0):
                
                pt1 = tuple(map(int, keypoints[p1]))
                pt2 = tuple(map(int, keypoints[p2]))

                if p1 in left_indices and p2 in left_indices:
                    color = BLUE
                elif p1 in right_indices and p2 in right_indices:
                    color = RED
                else:
                    color = GREEN

                cv2.line(frame, pt1, pt2, color, 2)

        for i, (x, y) in enumerate(keypoints):
            if x > 0 and y > 0:
                if i in left_indices:
                    color = BLUE
                elif i in right_indices:
                    color = RED
                else:
                    color = GREEN

                cv2.circle(frame, (int(x), int(y)), 4, color, -1)

    def process_frame(self, frame_path, all_poses):
        """Process a single frame with multiple bounding boxes"""
        frame_number = frame_path.stem.split('/')[-1]
        frame_number = frame_number.split('.')[0]
        frame = cv2.imread(str(frame_path))
        
        if frame is None:
            print(f"Error reading frame {frame_path}")
            return None, None, None
        
        frame_with_poses = frame.copy()
        frame_poses = []
        
        # Get predictions for this frame
        frame_predictions = self.predictions.get(f"{frame_number}", [])
        if not frame_predictions:
            print(f"No predictions found for frame {frame_number}")
            return frame_with_poses, frame_number, all_poses
        
        # Debug the predictions for this frame
        print(f"Found {len(frame_predictions)} predictions for frame {frame_number}")
        
        # Process each prediction
        for i, pred in enumerate(frame_predictions):
            try:
                print(f"Processing prediction {i+1}/{len(frame_predictions)}: {pred}")
                
                # Check if bbox field is present and valid
                if 'bbox' not in pred:
                    print(f"Warning: Missing bbox field in prediction {i+1}")
                    continue
                    
                bbox = pred['bbox']
                # Check if bbox is in the expected format
                if not isinstance(bbox, list) or len(bbox) < 4:
                    print(f"Warning: Invalid bbox format in prediction {i+1}: {bbox}")
                    continue
                
                confidence = pred.get('confidence', 1.0)  # Default to 1.0 if missing
                label = pred.get('label', f"Player {i+1}")  # Default with index if missing
                
                # Handle different bbox formats:
                # If bbox is [x, y, width, height] (COCO format)
                if len(bbox) == 4:
                    x1, y1 = bbox[0], bbox[1]
                    if isinstance(bbox[2], (int, float)) and isinstance(bbox[3], (int, float)):
                        # This is [x, y, width, height] format
                        w, h = bbox[2], bbox[3]
                        x2, y2 = x1 + w, y1 + h
                    else:
                        # This might be [x1, y1, x2, y2] format
                        x2, y2 = bbox[2], bbox[3]
                else:
                    print(f"Warning: Unexpected bbox format with {len(bbox)} elements")
                    continue
                
                # Store bbox in [x1, y1, x2, y2] format for processing
                bbox_coords = [x1, y1, x2, y2]
                
                # Debug the box coordinates
                print(f"Processing box: [{x1}, {y1}, {x2}, {y2}] for {label}")
                
                # Get expanded bbox for pose detection
                expanded_bbox = self.expand_bbox(bbox_coords)
                ex1, ey1, ex2, ey2 = expanded_bbox
                
                # Make sure coordinates are within frame boundaries
                ex1 = max(0, ex1)
                ey1 = max(0, ey1)
                ex2 = min(frame.shape[1], ex2)
                ey2 = min(frame.shape[0], ey2)
                
                # Extract player crop - ensure it's not empty
                if ex1 >= ex2 or ey1 >= ey2:
                    print(f"Warning: Invalid crop dimensions: [{ex1}, {ey1}, {ex2}, {ey2}]")
                    continue
                    
                player_crop = frame[ey1:ey2, ex1:ex2]
                if player_crop.size == 0:
                    print(f"Warning: Empty player crop for box {i+1}")
                    continue
                    
                # Get pose keypoints and confidence
                pose_results = self.model(player_crop)
                crop_keypoints, keypoint_conf = self.process_pose_keypoints(pose_results)
                
                # Map keypoints back to original frame coordinates
                valid_mask = crop_keypoints[:, 0] != 0
                crop_keypoints[valid_mask, 0] += ex1
                crop_keypoints[valid_mask, 1] += ey1
                
                # Store pose information - keep the original COCO format bbox
                pose_info = {
                    'bbox': bbox,  # Keep original bbox format
                    'bbox_confidence': float(confidence),
                    'label': label,
                    'keypoints': crop_keypoints.tolist(),
                    'keypoint_confidence': keypoint_conf.tolist()
                }
                frame_poses.append(pose_info)
                
                # Draw pose and bbox on the frame
                if np.any(crop_keypoints):
                    self.draw_pose(frame_with_poses, crop_keypoints, label)
                
                # Draw the original bounding box
                self.draw_bbox(frame_with_poses, bbox_coords, confidence, label)
                
                print(f"Successfully processed box {i+1} for {label}")
                
            except Exception as e:
                print(f"Error processing bbox {i+1} in frame {frame_number}: {str(e)}")
                # Continue to the next prediction even if this one failed
                continue
        
        if frame_poses:
            print(f"Saving {len(frame_poses)} poses for frame_{frame_number}")
            all_poses[f"frame_{frame_number}"] = frame_poses
        else:
            print(f"No valid poses extracted for frame_{frame_number}")
            
        return frame_with_poses, frame_number, all_poses

    def process_frames(self, output_dir, rally_id):
        output_dir = Path(output_dir) / rally_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        frame_files = sorted(self.frames_dir.glob("*.jpg"))
        if not frame_files:
            raise FileNotFoundError(f"No frames found in {self.frames_dir}")
        
        processed_frames = []
        all_poses = {}
        
        for frame_path in frame_files:                                                                        
            frame_with_poses, frame_number, all_poses = self.process_frame(frame_path, all_poses)
            # Save processed frame
            output_path = output_dir / f"{frame_number}_pred.jpg"
            cv2.imwrite(str(output_path), frame_with_poses)
            processed_frames.append(output_path)
        
        # Save complete poses file in data/pose directory
        pose_dir = Path("data") / "pose_coordinates"
        pose_dir.mkdir(exist_ok=True)
        pose_file = pose_dir / f"{rally_id}_pose.json"
        
        with open(pose_file, 'w') as f:
            json.dump(all_poses, f, indent=2)
        
        return processed_frames

    def create_video(self, processed_frames, output_path, fps=30):
        if not processed_frames:
            print("No processed frames available to create video")
            return
        
        first_frame = cv2.imread(str(processed_frames[0]))
        height, width = first_frame.shape[:2]
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        for frame_path in processed_frames:
            frame = cv2.imread(str(frame_path))
            if frame is not None:
                out.write(frame)
        
        out.release()
        print(f"Video saved to {output_path}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Tennis Player Pose Analysis')
    parser.add_argument('--rally', type=str, required=True,
                      help='Rally name (e.g., rally_name)')
    parser.add_argument('--fps', type=int, default=30,
                      help='FPS for output video')
    parser.add_argument('--base_dir', type=str, default="data",
                      help='Base directory containing data')
    
    args = parser.parse_args()
    
    base_dir = Path(args.base_dir)
    frames_dir = base_dir / "frames" / args.rally
    bbox_file = base_dir / "bbox" / f"{args.rally}_boxes.json"
    output_dir = base_dir / "processed_frames" / args.rally
    video_output = base_dir / "processed_videos" / f"{args.rally}.mp4"
    
    video_output.parent.mkdir(parents=True, exist_ok=True)
    
    analyzer = TennisPlayerAnalyzer(frames_dir, bbox_file)
    processed_frames = analyzer.process_frames(output_dir, args.rally)
    analyzer.create_video(processed_frames, video_output, args.fps)

if __name__ == "__main__":
    main()