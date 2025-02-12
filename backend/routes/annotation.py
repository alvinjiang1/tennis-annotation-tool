import json
import os
from flask import Blueprint, request, jsonify
from datetime import datetime

from routes.util import split_dataset

annotation_router = Blueprint("annotation", __name__)

# Path for saving COCO-style annotations locally
ANNOTATIONS_FILE = "coco_annotations.json"
PREDICTIONS_FILE = "predictions.json"

# Ensure file exists
if not os.path.exists(ANNOTATIONS_FILE):
    with open(ANNOTATIONS_FILE, "w") as f:
        json.dump({"images": [], "annotations": [], "categories": []}, f)

# REST API for saving annotations
@annotation_router.route("/save", methods=["POST"])
def save_annotation_rest():
    """
    REST API to save annotations with a local COCO format backup.
    Expects JSON:
    {
        "image_url": "path/to/image.jpg",
        "bounding_boxes": [
            {"x": 10, "y": 20, "width": 50, "height": 60, "label": "Player 1"}
        ]
        "width": 1280,
        "height": 720
    }
    """
    data = request.json
    image_url = data.get("image_url")
    bounding_boxes = data.get("bounding_boxes", [])
    width = data.get("width")
    height = data.get("height")    

    if not image_url or not bounding_boxes:
        return jsonify({"error": "Missing image_url or bounding_boxes"}), 400

    # Save to COCO format locally    
    save_annotation_coco(image_url, bounding_boxes, width, height)    

    return jsonify({"message": "Annotation saved successfully"}), 200


# Function to save annotations in COCO format
def save_annotation_coco(image_url, bounding_boxes, width, height):
    try:
        with open(ANNOTATIONS_FILE, "r") as f:
            coco_data = json.load(f)

        # Create unique image ID using timestamp
        image_id = int(datetime.now().timestamp())

        # Add image entry
        coco_data["images"].append({
            "id": image_id,
            "file_name": image_url.split("/")[-1],
            "width": width,
            "height": height,
        })        
        
        if not coco_data["categories"]:
            coco_data["categories"] = []

        categories = {}
        # Retrieve existing labels
        for cat in coco_data["categories"]:
            categories[cat["name"]] = cat["id"]
        
        # Add any new labels
        cat_id = len(categories) + 1
        for box in bounding_boxes:           
            if box["label"] not in categories: 
                categories[box["label"]] = cat_id
                cat_id += 1

        coco_data["categories"] = []
        for label in categories.keys():            
            coco_data["categories"].append(
                {
                    "id": categories[label],
                    "name": label,
                    "supercategory": "person"
                }
            )                                
        # Add bounding boxes
        for i, box in enumerate(bounding_boxes):
            coco_data["annotations"].append({
                "id": len(coco_data["annotations"]) + 1,
                "image_id": image_id,
                "category_id": categories[box["label"]],
                "bbox": [box["x"], box["y"], box["width"], box["height"]],
                "area": box["width"] * box["height"],
                "iscrowd": 0
            })

        # Save back to file
        with open(ANNOTATIONS_FILE, "w") as f:
            json.dump(coco_data, f, indent=4)
    
    except Exception as e:
        print(f"Error saving COCO annotations: {e}")


# REST API to fetch all annotations
@annotation_router.route("/get", methods=["GET"])
def get_annotations_rest():
    """
    REST API to fetch all annotations.
    Returns JSON:
    {
        "annotations": [{"id": 1, "image_url": "path/to/image.jpg", "bounding_boxes": [...] }]
    }
    """
    if not os.path.exists(ANNOTATIONS_FILE):
        return jsonify({"error": "Annotations file does not exist"}), 500
    
    annotations_file = json.loads(ANNOTATIONS_FILE)
    return annotations_file

@annotation_router.route("/label", methods=["POST"])
def label_frame():
    return jsonify({"message": "Frame labelled successfully"}), 200