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
# import routes.numpy_patch

training_router = Blueprint("training", __name__)
os.environ["TOKENIZERS_PARALLELISM"] = "false"

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
    training_status["last_status"] = "Initializing training..."

    try:
        if not update_configurations(video_id, categories):
            raise Exception("Failed to update config files")

        # Update status after configuration
        training_status["last_status"] = "Configurations updated, starting training process..."
            
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

        # Update status before starting subprocess
        training_status["last_status"] = "Running training process..."
        
        process = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
        
        # Don't wait for process to complete - just update status that it's running
        training_status["last_status"] = "Training in progress..."
        
        # Start a monitoring thread that doesn't block the main flow
        def monitor_process():
            stdout, stderr = process.communicate()
            print(f'process return code: {process.returncode}')
            
            if process.returncode != 0:
                error_msg = stderr.decode("utf-8")
                print(f'Training failed for video {video_id}: {error_msg}')
                training_status["last_status"] = f"Training failed: {error_msg[:100]}..."
            else:
                print(f"Training completed for video {video_id}")
                training_status["last_status"] = "Training completed successfully."
            
            training_status["running"] = False
            
        # Start monitoring in a separate thread
        monitor_thread = threading.Thread(target=monitor_process)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        # Return immediately while training continues in background
        return

    except Exception as e:
        print(f"Error running training: {e}")
        training_status["last_status"] = f"Training error: {str(e)}"
        training_status["running"] = False

@training_router.route("/train/start", methods=["POST"])
def start_training():
    """Starts fine-tuning the GroundingDINO model."""
    global training_status

    if training_status["running"]:
        print(f'Training already in progress')
        return jsonify({
            "status": "error", 
            "message": "Training is already in progress."
        }), 400

    # Get video_id from request
    print(f"Starting training")
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
        
    # Clear the output directory first to ensure clean training
    video_output_dir = os.path.join(OUTPUT_DIR, video_id)
    if os.path.exists(video_output_dir):
        # Remove all files in the directory but keep the directory itself
        for item in os.listdir(video_output_dir):
            item_path = os.path.join(video_output_dir, item)
            if os.path.isfile(item_path):
                os.remove(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
    else:
        # Create the directory if it doesn't exist
        os.makedirs(video_output_dir, exist_ok=True)

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