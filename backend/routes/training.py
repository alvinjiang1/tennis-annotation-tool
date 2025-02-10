import json
import re
import os
import subprocess
import threading
import time
from datetime import datetime
from flask import Blueprint, request, jsonify
from routes.util import split_dataset, modify_coco_2_odvg, modify_config_files

import yapf

training_router = Blueprint("training", __name__)

GROUNDING_DINO_PATH = "GroundingDINO"
TRAINING_DATA_PATH = "training_data"
CONFIG_PATH = "config/cfg_odvg.py"
DATASET_PATH = "config/datasets_mixed_odvg.json"
LABEL_JSON_PATH = "input_params/label.json"
COCO_TO_ODVG_PATH = "tools/coco2odvg.py"
TRAIN_SCRIPT = "main.py"
OUTPUT_DIR = "output"
MODEL_CHECKPOINT = os.path.join(OUTPUT_DIR, "checkpoint.pth")

training_status = {"running": False, "last_status": None}

def update_configurations(categories):
    """Modifies dataset configuration files before training."""
    # ------------------ 1. Split training sets ------------------
    split_dataset()
    
    # ------------------ 2. Update `coco2odvg.py` ------------------
    modify_coco_2_odvg(categories)

    # ------------------ 3. Modify `cfg_odvg.py` ------------------
    modify_config_files(categories)

    return True


def run_training(categories):
    """Runs GroundingDINO fine-tuning process in a separate thread."""
    global training_status

    training_status["running"] = True

    if not update_configurations(categories):
        training_status["last_status"] = "Failed to update config files."
        training_status["running"] = False
        return

    command = [
        "python", os.path.join(GROUNDING_DINO_PATH, TRAIN_SCRIPT),
        "--config_file", os.path.join(GROUNDING_DINO_PATH, CONFIG_PATH),
        "--datasets", os.path.join(GROUNDING_DINO_PATH, DATASET_PATH),
        "--output_dir", os.path.join(GROUNDING_DINO_PATH, OUTPUT_DIR),
        "--pretrain_model_path", "weights/groundingdino_swint_ogc.pth",
        "--options", "text_encoder_type=bert"
    ]

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()        

        if process.returncode == 0:
            training_status["last_status"] = "Training completed successfully."
        else:
            training_status["last_status"] = f"Training failed: {stderr.decode('utf-8')}"
    except Exception as e:
        training_status["last_status"] = f"Training error: {str(e)}"

    training_status["running"] = False


@training_router.route("/train/start", methods=["POST"])
def start_training():
    """Starts fine-tuning the GroundingDINO model."""
    global training_status

    if training_status["running"]:
        return jsonify({"status": "error", "message": "Training is already in progress."}), 400

    filepath = "coco_annotations.json"
    if not os.path.exists(filepath):
        return jsonify({"status": "error", "message": "Annotations file not found."}), 404
    with open(filepath, 'r') as f:
        categories = json.load(f)["categories"]
    if len(categories) != 4:
        return jsonify({"status": "error", "message": "Must provide exactly 4 player descriptions."}), 400

    training_thread = threading.Thread(target=run_training, args=(categories,))
    training_thread.start() 

    return jsonify({"status": "success", "message": "Training started."}), 200


@training_router.route("/train/status", methods=["GET"])
def get_training_status():
    """Returns the current status of the training process."""
    return jsonify({
        "running": training_status["running"],
        "last_status": training_status["last_status"]
    })
