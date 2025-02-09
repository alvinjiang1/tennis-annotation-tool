from flask import Blueprint, request, jsonify
import torch
import cv2
import numpy as np
import os
from models.grounding_dino import load_grounding_dino, run_inference, fine_tune_model
from routes.annotation import get_annotations_rest, get_groundingdino_predictions

# Blueprint for inference routes
inference_router = Blueprint("inference", __name__)

# Model is initially not loaded
model = None
model_ready = False  # Flag to check if model is fine-tuned


@inference_router.route("/run", methods=["POST"])
def run_model():
    """
    API endpoint to run inference on a given video frame. 
    Can only be called after the user has successfully submitted their annotations 
    and the model has been fine-tuned.

    Expected request format:
    {
        "video_path": "path/to/video.mp4",
        "frame_number": 120  # Optional, default is every N frames
    }
    """
    global model, model_ready

    if not model_ready:
        return jsonify({"error": "Model is not trained yet. Please train the model first."}), 400

    if model is None:
        return jsonify({"error": "Model failed to load. Please retry training."}), 500

    data = request.json
    video_path = data.get("video_path")
    frame_number = data.get("frame_number", None)

    if not video_path or not os.path.exists(video_path):
        return jsonify({"error": "Invalid video path"}), 400

    # Capture video
    cap = cv2.VideoCapture(video_path)
    frame_rate = cap.get(cv2.CAP_PROP_FPS)

    if not cap.isOpened():
        return jsonify({"error": "Failed to open video"}), 500

    results = []

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break  # End of video

        if frame_number is None or frame_idx % int(frame_rate) == 0:
            # Run GroundingDINO inference on the frame
            detections = run_inference(model, frame)
            results.append({
                "frame_number": frame_idx,
                "detections": detections  # List of bounding boxes + labels
            })

        frame_idx += 1

    cap.release()
    return jsonify(results)


@inference_router.route("/train", methods=["POST"])
def train_model():
    """
    API to trigger few-shot fine-tuning of the GroundingDINO model.
    Uses user-provided bounding box annotations for training.
    """
    global model, model_ready

    try:
        # Fetch user-provided annotations from the database
        annotations = get_annotations_rest()
        if not annotations:
            return jsonify({"error": "No annotations found for training"}), 400

        # Convert annotations to GroundingDINO training format
        training_data = []
        for annotation in annotations:
            image_path = annotation.image_url
            bounding_boxes = annotation.bounding_boxes
            training_data.append({"image": image_path, "boxes": bounding_boxes})

        # Load model before training
        model = load_grounding_dino()
        
        # Run fine-tuning
        updated_model_path = fine_tune_model(model, training_data)

        # Set the model as ready for inference
        model_ready = True

        return jsonify({"message": "Model fine-tuned successfully", "model_path": updated_model_path}), 200

    except Exception as e:
        model_ready = False  # Reset flag if training fails
        return jsonify({"error": str(e)}), 500
