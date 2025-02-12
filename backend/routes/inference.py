from flask import Blueprint, request, jsonify, send_from_directory
import torch
import cv2
import numpy as np
import os
import json
import subprocess

# Blueprint for inference routes
inference_router = Blueprint("inference", __name__)

PROCESSED_FOLDER = "processed"
FINETUNED_MODEL_PATH = "GroundingDINO/output/checkpoint0014.pth"
CONFIG_PATH = "GroundingDINO/tools/GroundingDINO_SwinT_OGC.py"
LABELS_PATH = "GroundingDINO/input_params/label.json"
INFERENCE_SCRIPT = "GroundingDINO/inference_on_a_image.py"
PREDICTIONS_FOLDER = "predictions"

inferring_status = {"running": False, "last_status": None}

from multiprocessing import Pool

def process_frame(frame_info):
    """Helper function to process a single frame."""
    frame_path, predictions_folder, labels = frame_info

    # output_path = os.path.join(predictions_folder, os.path.basename(frame_path))
    command = [
        "python", INFERENCE_SCRIPT,
        "-c", CONFIG_PATH,
        "-p", FINETUNED_MODEL_PATH,
        "-i", frame_path,
        "-t", labels,
        "-o", predictions_folder
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()

    if process.returncode != 0:
        return f"Inference failed for {frame_path}: {stderr.decode('utf-8')}"
    return None  # Success

@inference_router.route("/run", methods=["POST"])
def run_model():
    """Run inference on all frames in parallel using multiprocessing."""
    global inferring_status
    inferring_status["running"] = True

    data = request.json
    full_path = data['image_url']
    img = full_path.split('/')[-1]
    video_folder = full_path.split('/')[-2]
    frames_folder = os.path.join(PROCESSED_FOLDER, video_folder)
    image_path = os.path.join(PROCESSED_FOLDER, video_folder, img)        
    if not os.path.exists(frames_folder):
        return jsonify({"error": "Folder or Image does not exist"}), 404
    with open(LABELS_PATH, 'r') as f:
        json_data = json.load(f)
    labels = ".".join(json_data[key] for key in json_data)    
    
    frames = sorted(f for f in os.listdir(frames_folder) if f.endswith((".jpg", ".png")))
    if not frames:
        return jsonify({"error": "No frames found"}), 404

    frame_info_list = [(os.path.join(frames_folder, frame), PREDICTIONS_FOLDER, labels) for frame in frames]

    # Use multiprocessing to run inference in parallel
    with Pool(processes=4) as pool:  # Adjust number of processes based on CPU cores
        results = pool.map(process_frame, frame_info_list)

    # Check for errors
    errors = [error for error in results if error]
    if errors:
        inferring_status["last_status"] = " ".join(errors)
        return jsonify({"error": inferring_status["last_status"]}), 500

    inferring_status["running"] = False
    inferring_status["last_status"] = "Inference completed successfully."
    return jsonify({"message": "Inference completed for all frames"}), 200

@inference_router.route("/run/status", methods=["GET"])
def get_inference_status():
    """Returns the ucrrent status of the inference"""
    return jsonify({
        "running":inferring_status["running"],
        "last_status":inferring_status["last_status"],
    })

# Retrieve list of frames
@inference_router.route("/frames", methods=["GET"])
def get_extracted_frames():
    filename = request.args.get("filename")
    if not filename:
        return jsonify({"error": "Filename is required"}), 400

    filename_no_ext = os.path.splitext(filename)[0]  # Remove extension
    video_folder = os.path.join(PREDICTIONS_FOLDER)

    if not os.path.exists(video_folder):
        return jsonify({"error": "No frames found"}), 404

    frames = sorted(os.listdir(PREDICTIONS_FOLDER))
    return jsonify({"frames": [f"{filename_no_ext}/{frame}" for frame in frames]})

# Serve individual frame images
@inference_router.route("/frame/<path:folder>/<path:filename>")
def serve_frame(folder, filename):
    # video_folder = os.path.join(PROCESSED_FOLDER, folder)
    video_folder = PREDICTIONS_FOLDER
    if not os.path.exists(os.path.join(video_folder, filename)):
        return jsonify({"error": "File does not exist"}), 404
    return send_from_directory(video_folder, filename)