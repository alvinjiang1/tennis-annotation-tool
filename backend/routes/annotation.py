import json
import os
import cv2
from flask import Blueprint, request, jsonify
from datetime import datetime
from pathlib import Path
from routes.util import split_dataset
from models.pose_estimation.tennis_analyzer import TennisPlayerAnalyzer

annotation_router = Blueprint("annotation", __name__)

# Data directory structure
DATA_DIR = "data"
ANNOTATIONS_DIR = os.path.join(DATA_DIR, "annotations")
PREDICTIONS_DIR = os.path.join(DATA_DIR, "pose_coordinates")
RAW_FRAMES_DIR = os.path.join(DATA_DIR, "raw_frames")
POSE_COORDINATES_DIR = os.path.join(DATA_DIR, "pose_coordinates")
POSE_FRAMES_DIR = os.path.join(DATA_DIR, "pose_frames")
RALLIES_DIR = os.path.join(DATA_DIR, "rallies")

os.makedirs(ANNOTATIONS_DIR, exist_ok=True)

def get_annotation_path(video_id):
    """Get path for video's annotation file"""
    return os.path.join(ANNOTATIONS_DIR, f"{video_id}_coco_annotations.json")

def get_prediction_path(video_id):
    """Get path for video's prediction file"""
    return os.path.join(PREDICTIONS_DIR, f"{video_id}_pose.json")

def get_rallies_path(video_id):
    """Get path for video's prediction file"""
    return os.path.join(RALLIES_DIR, f"{video_id}_rallies.json")

def parse_image_url(image_url):
    """Get video ID from image URL"""
    data = image_url.split("/")
    video_id = data[-2].split(".")[0]    
    frame_number = data[-1].split("_")[0]
    return video_id, frame_number


def initialize_annotation_file(video_id):
    """Create empty annotation file if not exists"""
    annotation_file = get_annotation_path(video_id)
    if not os.path.exists(annotation_file):
        with open(annotation_file, "w") as f:
            json.dump({"images": [], "annotations": [], "categories": []}, f)
    return annotation_file

def initialize_rally_file(video_id):
    """Create empty rallies file if not exists"""
    rallies_file = get_rallies_path(video_id)
    if not os.path.exists(rallies_file):
        with open(rallies_file, "w") as f:
            json.dump({}, f)
    return rallies_file

@annotation_router.route("/save", methods=["POST"])
def save_annotation_rest():
    """Save annotations in COCO format"""
    data = request.json
    image_url = data.get("image_url")
    bounding_boxes = data.get("bounding_boxes", [])
    width = data.get("width")
    height = data.get("height")
    video_id = data.get("video_id")

    if not all([image_url, bounding_boxes, video_id]):
        print("Missing required fields")
        return jsonify({"error": "Missing required fields"}), 400

    save_annotation_coco(video_id, image_url, bounding_boxes, width, height)
    print("Annotation saved successfully")
    return jsonify({"message": "Annotation saved successfully"}), 200

def save_annotation_coco(video_id, image_url, bounding_boxes, width, height):
    """Save annotations in COCO format for specific video"""
    try:
        annotation_file = initialize_annotation_file(video_id)
        with open(annotation_file, "r") as f:
            coco_data = json.load(f)

        image_id = int(datetime.now().timestamp())
        
        coco_data["images"].append({
            "id": image_id,
            "file_name": image_url.split("/")[-1],
            "width": width,
            "height": height,
        })

        categories = {cat["name"]: cat["id"] for cat in coco_data["categories"]}
        cat_id = len(categories) + 1
        
        for box in bounding_boxes:
            if box["label"] not in categories:
                categories[box["label"]] = cat_id
                cat_id += 1

        coco_data["categories"] = [
            {"id": cat_id, "name": name, "supercategory": "person"}
            for name, cat_id in categories.items()
        ]

        for box in bounding_boxes:
            coco_data["annotations"].append({
                "id": len(coco_data["annotations"]) + 1,
                "image_id": image_id,
                "category_id": categories[box["label"]],
                "bbox": [box["x"], box["y"], box["width"], box["height"]],
                "area": box["width"] * box["height"],
                "iscrowd": 0
            })

        with open(annotation_file, "w") as f:
            json.dump(coco_data, f, indent=4)

    except Exception as e:
        print(f"Error saving COCO annotations: {e}")
        raise

@annotation_router.route("/get/<video_id>", methods=["GET"])
def get_annotations_rest(video_id):
    """Get annotations for specific video"""
    annotation_file = get_annotation_path(video_id)
    if not os.path.exists(annotation_file):
        print("Annotations not found")
        return jsonify({"error": "Annotations not found"}), 404
    
    with open(annotation_file) as f:
        annotations = json.load(f)    
    return jsonify(annotations)

@annotation_router.route("/get-bbox", methods=['POST'])
def get_bounding_boxes():
    """Get bounding boxes for video"""
    data = request.json    
    image_url = data.get("image_url")    
    video_id, frame_number = parse_image_url(image_url)
    prediction_file = get_prediction_path(video_id)    
    print("prediction file is:", prediction_file)
    if not os.path.exists(prediction_file):
        return jsonify({"error": "Bounding boxes not found"}), 404
    
    with open(prediction_file) as f:
        predictions = json.load(f)            
    return jsonify(predictions[f"frame_{frame_number}"])

@annotation_router.route("/update", methods=["PATCH"])
def update_annotations_rest():
    """Update annotations for specific video"""
    # NOTE: GroundingDINO Outputs will NOT be changed here
    #      This is for updating manual annotations AFTER GroundingDINO inference
    data = request.json
    image_url = data.get("image_url")
    video_id, frame_number = parse_image_url(image_url)        
    bboxes = data.get("bboxes")

    if not bboxes:
        print("No bounding boxes provided. Is that the intended behaviour?")    

    if not all([video_id, frame_number]):
        return jsonify({"error": "Missing required fields"}), 400    

    # Get frame_path and json_file
    raw_frames_path = os.path.join(RAW_FRAMES_DIR, video_id)
    boxes_path = os.path.join(DATA_DIR, "bbox", f"{video_id}_boxes.json")
    frame_path = Path(os.path.join(RAW_FRAMES_DIR, video_id, f"{frame_number}.jpg"))
    pose_coordinates_path = os.path.join(POSE_COORDINATES_DIR, f"{video_id}_pose.json")    
    output_dir = os.path.join(POSE_FRAMES_DIR, video_id)
    print(f"Updating new boxes and poses for video {video_id} frame {frame_number}")

    # Modify specific bounding boxes and poses
    with open(boxes_path, 'r') as f:
        old_boxes = json.load(f)    
    new_boxes = old_boxes
    new_boxes[frame_number] = [
        {
            "bbox": [int(b["x"]), int(b["y"]), int(b["width"]), int(b["height"])],
            "confidence": 1.0, # Manually labelled => 100% confident
            "label": b["label"]
        } for b in bboxes
    ] 

    # Update poses json
    with open(boxes_path, 'w') as f:
        json.dump(new_boxes, f, indent=2)
    analyzer = TennisPlayerAnalyzer(raw_frames_path, boxes_path)    
    with open(pose_coordinates_path, 'r') as pose_coordinates_json:
        all_poses = json.load(pose_coordinates_json)
    frame_with_poses, _, all_poses = analyzer.process_frame(frame_path, all_poses)        

    output_path = os.path.join(output_dir, f"{frame_number}_pred.jpg")
    cv2.imwrite(str(output_path), frame_with_poses)

    with open(pose_coordinates_path, 'w') as f:
        json.dump(all_poses, f, indent=2)
    return jsonify({"message": "Annotations updated successfully"}), 200

@annotation_router.route("/save-hitting-moments", methods=["POST"])
def save_hitting_moments():
    """Save hitting moments for specific video"""
    data = request.json    
    hitting_moments = data.get("hitting_moments")    
    rallies = {}
    if not hitting_moments['rally_1']:
        return jsonify({"error": "No hitting moments found"}), 400
    video_id, _ = parse_image_url(hitting_moments['rally_1'][0])
    rallies_filepath = get_rallies_path(video_id)

    for rally in hitting_moments:
        image_url_list = hitting_moments[rally]
        rallies[rally] = [parse_image_url(image_url)[1] for image_url in image_url_list]
        
    with open(rallies_filepath, 'w') as f:
        json.dump(rallies, f, indent=2)
    return jsonify({"message": "Hitting moments saved successfully"}), 200

@annotation_router.route("/save-categories", methods=["POST"])
def save_categories():
    """Save player categories for a specific video"""
    data = request.json
    video_id = data.get("video_id")
    categories = data.get("categories", [])
    
    if not video_id or not categories:
        return jsonify({"error": "Missing required fields"}), 400
    
    # Get the annotations file path
    annotation_file = get_annotation_path(video_id)
    
    try:
        # Create or load existing annotation file
        if os.path.exists(annotation_file):
            with open(annotation_file, "r") as f:
                coco_data = json.load(f)
        else:
            coco_data = {
                "images": [],
                "annotations": [],
                "categories": []
            }
        
        # Update categories
        coco_data["categories"] = categories
        
        # Save back to file
        with open(annotation_file, "w") as f:
            json.dump(coco_data, f, indent=4)
            
        return jsonify({"message": "Categories saved successfully"}), 200
    
    except Exception as e:
        print(f"Error saving categories: {e}")
        return jsonify({"error": str(e)}), 500

@annotation_router.route("/get-frame/<video_id>/<frame_id>", methods=["GET"])
def get_frame_annotations(video_id, frame_id):
    """Get annotations for a specific frame"""
    annotation_file = get_annotation_path(video_id)
    
    if not os.path.exists(annotation_file):
        return jsonify({"error": "Annotations not found"}), 404
    
    try:
        with open(annotation_file, "r") as f:
            coco_data = json.load(f)
            
        # Find the image ID for this frame
        image_id = None
        for image in coco_data.get("images", []):
            if image.get("file_name") == f"{frame_id}.jpg":
                image_id = image.get("id")
                break
                
        if image_id is None:
            return jsonify({"annotations": []}), 200
            
        # Get annotations for this image ID
        frame_annotations = [
            ann for ann in coco_data.get("annotations", [])
            if ann.get("image_id") == image_id
        ]
        
        return jsonify({
            "annotations": frame_annotations,
            "categories": coco_data.get("categories", [])
        }), 200
        
    except Exception as e:
        print(f"Error getting frame annotations: {e}")
        return jsonify({"error": str(e)}), 500

@annotation_router.route("/save-frame", methods=["POST"])
def save_frame_annotations():
    """Save annotations for a specific frame"""
    data = request.json
    video_id = data.get("video_id")
    frame_id = data.get("frame_id")
    annotations = data.get("annotations", [])
    width = data.get("width")
    height = data.get("height")
    
    if not all([video_id, frame_id, width, height]):
        return jsonify({"error": "Missing required fields"}), 400
        
    annotation_file = get_annotation_path(video_id)
    
    try:
        # Create or load existing annotation file
        if os.path.exists(annotation_file):
            with open(annotation_file, "r") as f:
                coco_data = json.load(f)
        else:
            coco_data = {
                "images": [],
                "annotations": [],
                "categories": []
            }
            
        # Check if this image is already in the images list
        image_exists = False
        image_id = None
        for image in coco_data.get("images", []):
            if image.get("file_name") == f"{frame_id}.jpg":
                image_exists = True
                image_id = image.get("id")
                break
                
        # If not, add it
        if not image_exists:
            image_id = int(datetime.now().timestamp())
            coco_data["images"].append({
                "id": image_id,
                "file_name": f"{frame_id}.jpg",
                "width": width,
                "height": height
            })
            
        # Remove existing annotations for this image
        coco_data["annotations"] = [
            ann for ann in coco_data.get("annotations", [])
            if ann.get("image_id") != image_id
        ]
        
        # Add the new annotations for this image
        next_ann_id = 1
        if coco_data["annotations"]:
            next_ann_id = max(ann.get("id", 0) for ann in coco_data["annotations"]) + 1
            
        for i, ann in enumerate(annotations):
            ann["id"] = next_ann_id + i
            ann["image_id"] = image_id
            coco_data["annotations"].append(ann)
            
        # Save back to file
        with open(annotation_file, "w") as f:
            json.dump(coco_data, f, indent=4)
            
        return jsonify({"message": "Frame annotations saved successfully"}), 200
        
    except Exception as e:
        print(f"Error saving frame annotations: {e}")
        return jsonify({"error": str(e)}), 500
    

@annotation_router.route("/get-rallies/<video_id>", methods=["GET"])
def get_rallies(video_id):
    """Get rally data for a specific video"""
    try:
        # Prepare rally data file path
        rally_dir = os.path.join(DATA_DIR, "rallies")
        os.makedirs(rally_dir, exist_ok=True)
        rally_file = os.path.join(rally_dir, f"{video_id}_rallies.json")
        
        # Return existing data if available
        if os.path.exists(rally_file):
            with open(rally_file, "r") as f:
                data = json.load(f)
            return jsonify(data)
        else:
            # Return empty structure if no data exists yet
            return jsonify({
                "netPosition": None,
                "rallies": {}
            })
    except Exception as e:
        print(f"Error getting rally data: {e}")
        return jsonify({"error": str(e)}), 500

@annotation_router.route("/save-rallies", methods=["POST"])
def save_rallies():
    """Save rally data for a specific video"""
    try:
        data = request.json
        video_id = data.get("video_id")
        rally_data = data.get("data")
        
        if not video_id or not rally_data:
            return jsonify({"error": "Missing video_id or rally data"}), 400
        
        # Ensure directory exists
        rally_dir = os.path.join(DATA_DIR, "rallies")
        os.makedirs(rally_dir, exist_ok=True)
        
        # Save rally data
        rally_file = os.path.join(rally_dir, f"{video_id}_rallies.json")
        with open(rally_file, "w") as f:
            json.dump(rally_data, f, indent=2)
        
        return jsonify({"message": "Rally data saved successfully"}), 200
    except Exception as e:
        print(f"Error saving rally data: {e}")
        return jsonify({"error": str(e)}), 500
    

@annotation_router.route("/get-pose-coordinates/<video_id>", methods=["GET"])
def get_pose_coordinates(video_id):
    """Get pose coordinates JSON for a specific video"""
    try:
        pose_file = os.path.join(POSE_COORDINATES_DIR, f"{video_id}_pose.json")
        
        if not os.path.exists(pose_file):
            return jsonify({"error": "Pose coordinates not found"}), 404
            
        with open(pose_file, 'r') as f:
            pose_data = json.load(f)
            
        return jsonify(pose_data)
    except Exception as e:
        print(f"Error getting pose coordinates: {e}")
        return jsonify({"error": str(e)}), 500

@annotation_router.route("/update-frame", methods=["POST"])
def update_frame_annotations():
    """Update bounding boxes for a specific frame - direct approach"""
    try:
        data = request.json
        video_id = data.get("video_id")
        frame_number = data.get("frame_number")
        bboxes = data.get("bboxes", [])
        
        if not all([video_id, frame_number, bboxes]):
            return jsonify({"error": "Missing required fields"}), 400
            
        # Path to raw frame
        frame_path = os.path.join(RAW_FRAMES_DIR, video_id, f"{frame_number}.jpg")
        if not os.path.exists(frame_path):
            return jsonify({"error": f"Frame {frame_number}.jpg not found"}), 404
            
        # Path to save boxes in JSON
        boxes_path = os.path.join(DATA_DIR, "bbox", f"{video_id}_boxes.json")
        os.makedirs(os.path.dirname(boxes_path), exist_ok=True)
        
        # Load existing boxes or create new dictionary
        if os.path.exists(boxes_path):
            with open(boxes_path, 'r') as f:
                boxes_data = json.load(f)
        else:
            boxes_data = {}
            
        # Update boxes for this frame
        boxes_data[frame_number] = bboxes
        
        # Save updated boxes
        with open(boxes_path, 'w') as f:
            json.dump(boxes_data, f, indent=2)
            
        # Path to save processed frames with poses
        output_dir = os.path.join(POSE_FRAMES_DIR, video_id)
        os.makedirs(output_dir, exist_ok=True)
        
        # Run pose estimation on the frame
        try:
            from models.pose_estimation.tennis_analyzer import TennisPlayerAnalyzer
            
            analyzer = TennisPlayerAnalyzer(
                frames_dir=os.path.join(RAW_FRAMES_DIR, video_id),
                bbox_file=boxes_path
            )
            
            # Process this specific frame
            pose_coordinates_path = os.path.join(POSE_COORDINATES_DIR, f"{video_id}_pose.json")
            os.makedirs(os.path.dirname(pose_coordinates_path), exist_ok=True)
            
            # Create or load pose coordinates file
            if os.path.exists(pose_coordinates_path):
                with open(pose_coordinates_path, 'r') as f:
                    all_poses = json.load(f)
            else:
                all_poses = {}
                
            # Process just this specific frame
            frame_with_poses, _, all_poses = analyzer.process_frame(
                frame_path=Path(frame_path),
                all_poses=all_poses
            )
            
            # Save updated pose file
            with open(pose_coordinates_path, 'w') as f:
                json.dump(all_poses, f, indent=2)
                
            # Save the processed frame
            output_path = os.path.join(output_dir, f"{frame_number}_pred.jpg")
            if frame_with_poses is not None:
                cv2.imwrite(str(output_path), frame_with_poses)
            else:
                return jsonify({"error": "Failed to process frame with poses"}), 500
                
        except Exception as e:
            print(f"Error processing frame with poses: {e}")
            return jsonify({"error": f"Error in pose processing: {str(e)}"}), 500
            
        return jsonify({
            "message": "Frame bounding boxes and poses updated successfully",
            "frame": frame_number,
            "bbox_count": len(bboxes)
        }), 200
        
    except Exception as e:
        print(f"Error updating frame annotations: {e}")
        return jsonify({"error": str(e)}), 500