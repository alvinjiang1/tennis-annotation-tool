from flask import Blueprint, request, jsonify, send_from_directory
import torch
import cv2
import numpy as np
import os
import json
import subprocess
from multiprocessing import Pool
from models.pose_estimation.tennis_analyzer import TennisPlayerAnalyzer
from models.shot_labelling.gemini import predict_rallies_gemini
from routes.annotation import parse_image_url

# Blueprint for inference routes
inference_router = Blueprint("inference", __name__)

# Base directories
BASE_DIR = "data"
RAW_FRAMES_DIR = os.path.join(BASE_DIR, "raw_frames")
GROUNDING_DINO_OUTPUT_DIR = os.path.join(BASE_DIR, "grounding_dino_output")
GROUNDING_DINO_TRAINING_DIR = os.path.join(BASE_DIR, "grounding_dino_training")
PREDICTIONS_DIR = os.path.join(BASE_DIR, "grounding_frames")
POSE_DIR = os.path.join(BASE_DIR, "pose_frames")

# GroundingDINO paths
# INFERENCE_SCRIPT = os.path.join("models", "grounding_dino", "GroundingDINO", "inference_on_a_image.py")
INFERENCE_SCRIPT = os.path.join("models", "grounding_dino", "GroundingDINO", "inference_on_a_folder.py")
CONFIG_PATH = os.path.join("models", "grounding_dino", "GroundingDINO", "tools", "GroundingDINO_SwinT_OGC.py")

inferring_status = {"running": False, "last_status": None}

def get_video_specific_paths(video_id):
    """Helper function to get video-specific paths."""
    return {
        'frames_dir': os.path.join(RAW_FRAMES_DIR, video_id),
        'model_path': os.path.join(GROUNDING_DINO_OUTPUT_DIR, video_id, "checkpoint0014.pth"),
        'labels_path': os.path.join(GROUNDING_DINO_TRAINING_DIR, video_id, "label.json"),
        'predictions_dir': os.path.join(PREDICTIONS_DIR, video_id)
    }

def process_frame(frame_info):
    """Helper function to process a single frame."""
    frame_path, predictions_dir, model_path, labels = frame_info
    
    command = [
        "python", INFERENCE_SCRIPT,
        "-c", CONFIG_PATH,
        "-p", model_path,
        "-i", frame_path,
        "-t", labels,
        "-o", predictions_dir
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()

    if process.returncode != 0:
        return f"Inference failed for {frame_path}: {stderr.decode('utf-8')}"
    return None  # Success

def process_frames(video_id, frame_info):
    """Helper function to process all frames in a folder."""
    frame_path, predictions_dir, model_path, labels = frame_info
    
    command = [
        "python", INFERENCE_SCRIPT,
        "-c", CONFIG_PATH,
        "-p", model_path,
        "-i", os.path.join(frame_path),
        "-t", labels,
        "-o", predictions_dir
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    # process = subprocess.run(command)

    if process.returncode != 0:
        print(f"Inference failed for {frame_path}: {stderr.decode('utf-8')}")
        return f"Inference failed for {frame_path}: {stderr.decode('utf-8')}"
    return None  # Success

def process_pose(video_id, frame_info):
    frame_path, predictions_dir, model_path, labels = frame_info
    json_file = os.path.join("data", "bbox", f"{video_id}_boxes.json")
    print(f'Processing poses for video: {video_id} with json file: {json_file} and frame_path: {frame_path}')
    
    analyzer = TennisPlayerAnalyzer(frame_path, json_file)
    analyzer.process_frames(POSE_DIR, video_id)
    
    return None

@inference_router.route("/run", methods=["POST"])
def run_model():
    """Run inference on all frames in parallel using multiprocessing."""
    print(f"Starting inference on all frames")
    global inferring_status
    inferring_status["running"] = True

    data = request.json
    video_id = data['video_id']
    print(f"performing inference on video: {video_id}")
    
    paths = get_video_specific_paths(video_id)
    
    if not os.path.exists(paths['frames_dir']):
        return jsonify({"error": "Frames directory does not exist"}), 404
        
    # Read labels
    try:
        with open(paths['labels_path'], 'r') as f:
            json_data = json.load(f)
        labels = ".".join(json_data[key] for key in json_data)
    except FileNotFoundError:
        return jsonify({"error": "Labels file not found"}), 404
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid labels file"}), 400
    
    frames = sorted(f for f in os.listdir(paths['frames_dir']) if f.endswith((".jpg", ".png")))
    if not frames:
        return jsonify({"error": "No frames found"}), 404

    # frame_info_list = [
    #     (os.path.join(paths['frames_dir'], frame), paths['predictions_dir'], paths['model_path'], labels) for frame in frames
    # ]
    frame_info_list = (paths['frames_dir'], paths['predictions_dir'], paths['model_path'], labels)

    # Use multiprocessing to run inference in parallel
    # with Pool(processes=4) as pool:  # Adjust number of processes based on CPU cores
    #     results = pool.map(process_frame, frame_info_list)
    
    res = process_frames(video_id, frame_info_list)
    if res:
        print(res)
        inferring_status["running"] = False
        inferring_status["last_status"] = res
        return jsonify({"error": inferring_status["last_status"]}), 500

    # Check for errors
    # errors = [error for error in results if error]
    # if errors:
    #     inferring_status["last_status"] = " ".join(errors)
    #     return jsonify({"error": inferring_status["last_status"]}), 500

    process_pose(video_id, frame_info_list)
    
    inferring_status["running"] = False
    inferring_status["last_status"] = "Inference completed successfully."
    print("Inference completed for all frames")
    return jsonify({"message": "Inference completed for all frames"}), 200

@inference_router.route("/run/status", methods=["GET"])
def get_inference_status():
    """Returns the current status of the inference"""
    return jsonify({
        "running": inferring_status["running"],
        "last_status": inferring_status["last_status"],
    })

@inference_router.route("/frames/<video_id>", methods=["GET"])
def get_extracted_frames(video_id):
    video_id = video_id.split('.')[0]
    
    """Retrieve list of frames for a specific video"""
    predictions_dir = os.path.join(PREDICTIONS_DIR, video_id)

    if not os.path.exists(predictions_dir):
        return jsonify({"error": "No predictions found for this video"}), 404

    frames = sorted(os.listdir(predictions_dir))
    return jsonify({"frames": frames})

@inference_router.route("/frame/<video_id>/<path:filename>")
def serve_frame(video_id, filename):
    """Serve individual frame images from predictions"""
    video_id = video_id.split('.')[0]
    predictions_dir = os.path.join(POSE_DIR, video_id)
    
    if not os.path.exists(os.path.join(predictions_dir, filename)):
        return jsonify({"error": "Prediction file does not exist"}), 404
        
    return send_from_directory(predictions_dir, filename)

@inference_router.route("/predict", methods=["POST"])
def predict_rallies():
    data = request.json
    video_id, _ = parse_image_url(data['image_url'])
    print(f"Starting shot label generation on: {video_id}")
    return predict_rallies_gemini(video_id)