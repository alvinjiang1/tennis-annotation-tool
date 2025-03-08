from flask import Blueprint, request, jsonify
from models.shot_labelling.random import generate_labels

generate_label_router = Blueprint("generate_label", __name__)

@generate_label_router.route("/predict", methods=["POST"])
def predict_labels():
    """Generate shot labels for a specific video"""
    data = request.json
    if not data or 'video_id' not in data:
        return jsonify({"error": "video_id is required"}), 400
    
    video_id = data['video_id']
    print(f"Starting shot label generation on: {video_id}")
    
    try:
        return generate_labels(video_id)
    except Exception as e:
        print(f"Error generating labels: {e}")
        return jsonify({"error": str(e)}), 500