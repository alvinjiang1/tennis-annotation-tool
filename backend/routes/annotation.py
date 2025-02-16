import json
import os
from flask import Blueprint, request, jsonify
from datetime import datetime
from routes.util import split_dataset

annotation_router = Blueprint("annotation", __name__)

# Data directory structure
DATA_DIR = "data"
ANNOTATIONS_DIR = os.path.join(DATA_DIR, "annotations")
os.makedirs(ANNOTATIONS_DIR, exist_ok=True)

def get_annotation_path(video_id):
    """Get path for video's annotation file"""
    return os.path.join(ANNOTATIONS_DIR, f"{video_id}_coco_annotations.json")

def initialize_annotation_file(video_id):
    """Create empty annotation file if not exists"""
    annotation_file = get_annotation_path(video_id)
    if not os.path.exists(annotation_file):
        with open(annotation_file, "w") as f:
            json.dump({"images": [], "annotations": [], "categories": []}, f)
    return annotation_file

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