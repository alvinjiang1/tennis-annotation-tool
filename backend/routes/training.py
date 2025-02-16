import json
import re
import os
import subprocess
import threading
import time
import shutil
from datetime import datetime
from flask import Blueprint, request, jsonify
from routes.util import split_dataset, modify_coco_2_odvg, modify_config_files

import yapf

training_router = Blueprint("training", __name__)

# Base directories
DATA_DIR = "data"
GROUNDING_DINO_PATH = "models/grounding_dino/GroundingDINO"

# Data subdirectories
ANNOTATIONS_DIR = os.path.join(DATA_DIR, "annotations")
TRAINING_DIR = os.path.join(DATA_DIR, "grounding_dino_training")
CONFIG_DIR = "config"
OUTPUT_DIR = os.path.join(DATA_DIR, "grounding_dino_output")

# Create necessary directories
for directory in [ANNOTATIONS_DIR, TRAINING_DIR, CONFIG_DIR, OUTPUT_DIR]:
    os.makedirs(directory, exist_ok=True)

# Configuration and model paths
CONFIG_PATH = os.path.join(GROUNDING_DINO_PATH, CONFIG_DIR, "cfg_odvg.py")
DATASET_PATH = os.path.join(GROUNDING_DINO_PATH, CONFIG_DIR, "datasets_mixed_odvg.json")
TRAIN_SCRIPT = "main.py"
INPUT_PARAMS_PATH = os.path.join(GROUNDING_DINO_PATH, "input_params.json")
MODEL_CHECKPOINT = os.path.join(OUTPUT_DIR, "checkpoint.pth")

training_status = {"running": False, "last_status": None}

def get_annotation_path(video_id):
    """Get path for video's annotation file"""
    return os.path.join(ANNOTATIONS_DIR, f"{video_id}_coco_annotations.json")

def update_configurations(video_id, categories):
    """Modifies dataset configuration files before training."""
    try:
        # Create training data directory for this video
        video_training_dir = os.path.join(TRAINING_DIR, video_id)
        os.makedirs(video_training_dir, exist_ok=True)

        # Copy and prepare config files
        os.makedirs(CONFIG_DIR, exist_ok=True)
        
        # 1. Split training sets
        split_dataset(
            annotations_path=get_annotation_path(video_id),
            output_dir=video_training_dir,
            video_id=video_id
        )
        print(f"Step 1: Split dataset for video {video_id}")
        
        # 2. Update coco2odvg.py
        modify_coco_2_odvg(categories, video_id)
        print(f"Step 2: Modify coco2odvg.py")

        # 3. Modify cfg_odvg.py
        modify_config_files(categories)
        print(f"Step 3: Modify cfg_odvg.py")
        return True
    
    except Exception as e:
        print(f"Error updating configurations: {e}")
        return False

def run_training(video_id, categories):
    """Runs GroundingDINO fine-tuning process in a separate thread."""
    print(f"Running training for video {video_id}")
    global training_status
    training_status["running"] = True

    try:
        if not update_configurations(video_id, categories):
            raise Exception("Failed to update config files")

        # Create video-specific output directory
        video_output_dir = os.path.join(OUTPUT_DIR, video_id)
        os.makedirs(video_output_dir, exist_ok=True)

        command = [
            "python", os.path.join(GROUNDING_DINO_PATH, TRAIN_SCRIPT),
            "--config_file", CONFIG_PATH,
            "--datasets", DATASET_PATH,
            "--output_dir", video_output_dir,
            "--pretrain_model_path", "models/grounding_dino/weights/groundingdino_swint_ogc.pth",
            "--options", "text_encoder_type=models/grounding_dino/bert",
        ]

        process = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            print(f'Training failed for video {video_id}: {stderr.decode("utf-8")}')
            training_status["last_status"] = f"Training failed"
        else:
            print(f"Training completed for video {video_id}")
            training_status["last_status"] = "Training completed successfully."

    except Exception as e:
        print(f"Error running training: {e}")
        training_status["last_status"] = f"Training error: {str(e)}"
    finally:
        training_status["running"] = False
        training_status["last_status"] = f'Successfully trained model for video {video_id}'

@training_router.route("/train/start", methods=["POST"])
def start_training():
    """Starts fine-tuning the GroundingDINO model."""
    global training_status

    if training_status["running"]:
        return jsonify({
            "status": "error", 
            "message": "Training is already in progress."
        }), 400

    # Get video_id from request
    data = request.json
    video_id = data.get("video_id")
    if not video_id:
        return jsonify({
            "status": "error", 
            "message": "video_id is required"
        }), 400

    # Check for annotations file
    annotation_file = get_annotation_path(video_id)
    if not os.path.exists(annotation_file):
        return jsonify({
            "status": "error", 
            "message": f"Annotations not found for video {video_id}"
        }), 404

    # Load and validate categories
    with open(annotation_file, 'r') as f:
        categories = json.load(f)["categories"]
    if len(categories) != 4:
        return jsonify({
            "status": "error", 
            "message": "Must provide exactly 4 player descriptions."
        }), 400

    # Start training in background
    training_thread = threading.Thread(
        target=run_training, 
        args=(video_id, categories)
    )
    training_thread.start()

    return jsonify({
        "status": "success", 
        "message": "Training started."
    }), 200

@training_router.route("/train/status", methods=["GET"])
def get_training_status():
    """Returns the current status of the training process."""
    return jsonify({
        "running": training_status["running"],
        "last_status": training_status["last_status"]
    })