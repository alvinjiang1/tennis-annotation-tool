from flask import Blueprint, request, jsonify
from models.shot_labelling.random import RandomModel
from models.shot_labelling.gemini import GeminiModel
from models.shot_labelling.cnn import CNNModel

generate_label_router = Blueprint("generate_label", __name__)

# Initialize models
random_model = RandomModel()
gemini = GeminiModel()
cnn_model = CNNModel()

AVAILABLE_MODELS = {
    "random": {
        "id": random_model.id,
        "name": random_model.name,
        "description": random_model.description,
        "model": random_model       
    },
    "gemini": {
        "id": gemini.id,
        "name": gemini.name,
        "description": gemini.description,
        "model": gemini
    },
    "cnn": {
        "id": cnn_model.id,
        "name": cnn_model.name,
        "description": cnn_model.description,
        "model": cnn_model
    }
}

@generate_label_router.route("/predict", methods=["POST"])
def predict_labels():
    """Generate shot labels for a specific video using the selected model"""
    data = request.json
    if not data or 'video_id' not in data:
        return jsonify({"error": "video_id is required"}), 400
    
    video_id = data['video_id']
    # Get the selected model (default to "cnn" if not specified)
    selected_model = data.get('model', 'cnn')
    
    print(f"Starting shot label generation on: {video_id} using model: {selected_model}")    
    try:
        # Check if the requested model exists
        if selected_model in AVAILABLE_MODELS:
            generator = AVAILABLE_MODELS[selected_model]["model"]
            return generator.generate_labels(video_id)
        else:
            # Fallback to CNN model if specified model isn't available
            print(f"Requested model '{selected_model}' not found, using CNN model instead")
            return cnn_model.generate_labels(video_id)
            
    except Exception as e:
        print(f"Error generating labels: {e}")
        return jsonify({"error": str(e)}), 500
    
@generate_label_router.route("/models", methods=["GET"])
def list_models():
    """Return a list of all available prediction models"""
    # Return all models except for their function references
    model_list = []
    for model_id, model_data in AVAILABLE_MODELS.items():
        # Create a copy without the model function
        model_info = {k: v for k, v in model_data.items() if k != "model"}
        model_list.append(model_info)
    
    return jsonify({
        "models": model_list
    })

@generate_label_router.route("/cnn/predict/<video_id>", methods=["POST"])
def predict_cnn_labels(video_id):
    """Generate shot labels using specifically the CNN model"""
    if not video_id:
        return jsonify({"error": "video_id is required"}), 400
    
    print(f"Starting CNN shot label generation on: {video_id}")    
    try:
        return cnn_model.generate_labels(video_id)
    except Exception as e:
        print(f"Error generating CNN labels: {e}")
        return jsonify({"error": str(e)}), 500

@generate_label_router.route("/cnn/status", methods=["GET"])
def get_cnn_status():
    """Check if CNN model is loaded and ready for inference"""
    try:
        status = {
            "loaded": hasattr(cnn_model, "models") and len(cnn_model.models) > 0,
            "available_tasks": list(cnn_model.models.keys()) if hasattr(cnn_model, "models") else [],
            "device": str(cnn_model.device) if hasattr(cnn_model, "device") else "unknown"
        }
        return jsonify(status), 200
    except Exception as e:
        return jsonify({"error": f"Error checking CNN status: {str(e)}"}), 500