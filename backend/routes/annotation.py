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