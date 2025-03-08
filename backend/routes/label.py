from flask import Blueprint, request, jsonify
import os
import json
import shutil

# Create blueprint
label_router = Blueprint("label", __name__)

# Base directories
DATA_DIR = "data"
GENERATED_LABELS_DIR = os.path.join(DATA_DIR, "generated_labels")
CONFIRMED_LABELS_DIR = os.path.join(DATA_DIR, "confirmed_labels")
POSE_DIR = os.path.join(DATA_DIR, "pose_frames")

# Ensure output directories exist
os.makedirs(GENERATED_LABELS_DIR, exist_ok=True)
os.makedirs(CONFIRMED_LABELS_DIR, exist_ok=True)

@label_router.route("/check/<video_id>", methods=["GET"])
def check_label_file(video_id):
    """Check if generated label file exists for a video."""
    # First check in confirmed labels
    confirmed_path = os.path.join(CONFIRMED_LABELS_DIR, f"{video_id}_labelled.json")
    if os.path.exists(confirmed_path):
        return jsonify({
            "exists": True, 
            "message": "Confirmed label file exists",
            "confirmed": True
        }), 200
    
    # Then check in generated labels
    generated_path = os.path.join(GENERATED_LABELS_DIR, f"{video_id}_labelled.json")
    if os.path.exists(generated_path):
        return jsonify({
            "exists": True, 
            "message": "Generated label file exists",
            "confirmed": False
        }), 200
    
    return jsonify({
        "exists": False, 
        "message": "No label file found"
    }), 404

@label_router.route("/get/<video_id>", methods=["GET"])
def get_labels(video_id):
    """Get shot labels for a specific video, preferring confirmed labels if available."""
    # First check in confirmed labels
    confirmed_path = os.path.join(CONFIRMED_LABELS_DIR, f"{video_id}_labelled.json")
    if os.path.exists(confirmed_path):
        try:
            with open(confirmed_path, 'r') as f:
                labels_data = json.load(f)
            return jsonify({
                "data": labels_data,
                "source": "confirmed"
            }), 200
        except Exception as e:
            return jsonify({"error": f"Error reading confirmed label file: {str(e)}"}), 500
    
    # Then check in generated labels
    generated_path = os.path.join(GENERATED_LABELS_DIR, f"{video_id}_labelled.json")
    if os.path.exists(generated_path):
        try:
            with open(generated_path, 'r') as f:
                labels_data = json.load(f)
            return jsonify({
                "data": labels_data,
                "source": "generated"
            }), 200
        except Exception as e:
            return jsonify({"error": f"Error reading generated label file: {str(e)}"}), 500
    
    return jsonify({"error": "Label file not found"}), 404

@label_router.route("/update/<video_id>", methods=["POST"])
def update_label(video_id):
    """Update a specific shot label and save to confirmed labels directory."""
    # First determine the source file
    confirmed_path = os.path.join(CONFIRMED_LABELS_DIR, f"{video_id}_labelled.json")
    generated_path = os.path.join(GENERATED_LABELS_DIR, f"{video_id}_labelled.json")
    
    # Choose the path to read from (prefer confirmed if exists)
    source_path = confirmed_path if os.path.exists(confirmed_path) else generated_path
    
    if not os.path.exists(source_path):
        return jsonify({"error": "Label file not found"}), 404
    
    data = request.json
    if not data or 'rallyIndex' not in data or 'eventIndex' not in data or 'updatedEvent' not in data:
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        # Load the current labels file
        with open(source_path, 'r') as f:
            labels_data = json.load(f)
        
        # Update the specified label
        rally_index = data['rallyIndex']
        event_index = data['eventIndex']
        updated_event = data['updatedEvent']
        
        # Ensure the rally and event indices are valid
        if rally_index >= len(labels_data.get('rallies', [])):
            return jsonify({"error": "Invalid rally index"}), 400
        
        rally = labels_data['rallies'][rally_index]
        if event_index >= len(rally.get('events', [])):
            return jsonify({"error": "Invalid event index"}), 400
        
        # Update the event
        labels_data['rallies'][rally_index]['events'][event_index] = updated_event
        
        # Always save to confirmed labels directory
        with open(confirmed_path, 'w') as f:
            json.dump(labels_data, f, indent=2)
        
        return jsonify({
            "message": "Label updated successfully",
            "saved_to": "confirmed_labels"
        }), 200
    except Exception as e:
        return jsonify({"error": f"Error updating label: {str(e)}"}), 500

@label_router.route("/confirm/<video_id>", methods=["POST"])
def confirm_labels(video_id):
    """Copy generated labels to confirmed labels directory."""
    generated_path = os.path.join(GENERATED_LABELS_DIR, f"{video_id}_labelled.json")
    confirmed_path = os.path.join(CONFIRMED_LABELS_DIR, f"{video_id}_labelled.json")
    
    if not os.path.exists(generated_path):
        return jsonify({"error": "Generated label file not found"}), 404
    
    try:
        # Copy file from generated to confirmed directory
        shutil.copy2(generated_path, confirmed_path)
        return jsonify({
            "message": "Labels confirmed successfully",
            "source": generated_path,
            "destination": confirmed_path
        }), 200
    except Exception as e:
        return jsonify({"error": f"Error confirming labels: {str(e)}"}), 500