from flask import Blueprint, request, jsonify
from models.shot_labelling.random import RandomModel
from models.shot_labelling.gemini import GeminiModel

generate_label_router = Blueprint("generate_label", __name__)

random_model = RandomModel()
gemini = GeminiModel()
AVAILABLE_MODELS = {
    "random": {
        "id": random_model.id,
        "name": random_model.name,
        "description": random_model.description,
        "model": random_model       
    },
    "gemini": {
        "id":  gemini.id,
        "name": gemini.name,
        "description": gemini.description,
        "model": gemini
    }
}

@generate_label_router.route("/predict", methods=["POST"])
def predict_labels():
    """Generate shot labels for a specific video using the selected model"""
    data = request.json
    if not data or 'video_id' not in data:
        return jsonify({"error": "video_id is required"}), 400
    
    video_id = data['video_id']
    # Get the selected model (default to "random" if not specified)
    selected_model = data.get('model', 'random')
    
    print(f"Starting shot label generation on: {video_id} using model: {selected_model}")    
    try:
        # Check if the requested model exists
        if selected_model in AVAILABLE_MODELS:
            generator = AVAILABLE_MODELS[selected_model]["model"]
            return generator.generate_labels(video_id)
        else:
            # Fallback to random model if specified model isn't available
            print(f"Requested model '{selected_model}' not found, using random model instead")
            return random_model.generate_labels(video_id)
            
    except Exception as e:
        print(f"Error generating labels: {e}")
        return jsonify({"error": str(e)}), 500
    
    
@generate_label_router.route("/models", methods=["GET"])
def list_models():
    """Return a list of all available prediction models"""
    # Return all models except for their function references
    model_list = []
    for model_id, model_data in AVAILABLE_MODELS.items():
        # Create a copy without the function
        model_info = {k: v for k, v in model_data.items() if k != "model"}
        model_list.append(model_info)
    
    return jsonify({
        "models": model_list
    })