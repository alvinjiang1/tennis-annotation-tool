import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import json
import os
from models.shot_labelling.shot_labelling_model import ShotLabellingModel
import torchvision.models as models

# Single Image CNN (for shot_type, side)
class TennisCNN(nn.Module):
    def __init__(self, num_classes, pretrained=True):
        super(TennisCNN, self).__init__()
        # Use a pre-trained ResNet model
        self.backbone = models.resnet50()
        
        # Replace the final fully connected layer for our classification task
        in_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(in_features, num_classes)
        )
    
    def forward(self, x):
        return self.backbone(x)

# Dual Image CNN (for formation, shot_direction, serve_direction, outcome)
class DualImageTennisCNN(nn.Module):
    def __init__(self, num_classes, pretrained=True):
        super(DualImageTennisCNN, self).__init__()
        # Create two separate backbones for player and partner
        self.player_backbone = models.resnet50()
        self.partner_backbone = models.resnet50()
        
        self.player_features = nn.Sequential(*list(self.player_backbone.children())[:-1])
        self.partner_features = nn.Sequential(*list(self.partner_backbone.children())[:-1])
        
        # Get feature dimensions (2048 for ResNet50)
        self.feature_dim = 2048
        
        self.classifier = nn.Sequential(
            nn.Linear(self.feature_dim * 2, 512),  # Combine features from both players
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes)
        )
    
    def forward(self, player_img, partner_img):
        # Extract features from both images
        player_features = self.player_features(player_img)
        partner_features = self.partner_features(partner_img)
        
        # Flatten feature maps
        player_features = torch.flatten(player_features, 1)
        partner_features = torch.flatten(partner_features, 1)
        
        # Concatenate features from both images
        combined_features = torch.cat((player_features, partner_features), dim=1)
        
        # Pass through classifier
        output = self.classifier(combined_features)
        
        return output

class CNNModel(ShotLabellingModel):
    def __init__(self):
        super().__init__(id="cnn", rallies_path="rallies",
                        output_path="generated_labels", pose_coordinates_path="pose_coordinates",
                        annotations_path="annotations")
        
        self.name = "CNN Shot Predictor"
        self.description = "CNN-based shot label generator using trained models"
        
        # Set up device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        # Set up transforms
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        # Load model configurations and weights
        self.cnn_dir = os.path.join("models", "shot_labelling", "cnn")
        
        # Initialize model storage
        self.models = {}
        self.configs = {}
        self.reverse_mappings = {}
        
        # Load all models
        self.load_models()
    
    def load_models(self):
        """Load all CNN models with their weights and configurations"""
        tasks = ["shot_type", "side", "formation", "shot_direction", "serve_direction", "outcome"]
        
        for task in tasks:
            try:
                # Load hyperparameters
                hyperparams_path = os.path.join(self.cnn_dir, task, "hyperparameters.json")
                if not os.path.exists(hyperparams_path):
                    print(f"Warning: Hyperparameters file not found for {task} at {hyperparams_path}")
                    continue
                    
                with open(hyperparams_path, 'r') as f:
                    config = json.load(f)
                
                # Get class mappings
                class_mappings = config.get("class_mappings", {})
                num_classes = len(class_mappings)
                
                # Create reverse mapping (index to label)
                reverse_mapping = {v: k for k, v in class_mappings.items()}
                
                # Model weights path
                model_path = os.path.join(self.cnn_dir, task, "best_model.pth")
                if not os.path.exists(model_path):
                    print(f"Warning: Weights file not found for {task} at {model_path}")
                    continue
                
                # Initialize the appropriate model based on config
                model_type = config.get("model", "ResNet50")
                print(f"Loading {task} model ({model_type}) with {num_classes} classes...")
                
                if model_type == "DualImageResNet50":
                    model = DualImageTennisCNN(num_classes=num_classes)
                else:  # Default to ResNet50
                    model = TennisCNN(num_classes=num_classes)
                
                # Load checkpoint
                checkpoint = torch.load(model_path, map_location=self.device)
                
                # Extract model weights from checkpoint
                if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
                    # Load from training checkpoint format
                    print(f"Loading {task} from checkpoint dictionary...")
                    state_dict = checkpoint["model_state_dict"]
                    
                    # Optional: Print validation accuracy if available
                    if "val_acc" in checkpoint:
                        print(f"Model validation accuracy: {checkpoint['val_acc']:.2f}%")
                else:
                    # Try loading directly if it's just the state dict
                    print(f"Loading {task} from direct state dictionary...")
                    state_dict = checkpoint
                
                # Load state dict into model
                try:
                    model.load_state_dict(state_dict)
                    print(f"Successfully loaded weights for {task}")
                except Exception as e:
                    print(f"Error loading state dict for {task}: {str(e)}")
                    print(f"Attempting to load with strict=False...")
                    
                    # Try loading with strict=False to ignore missing keys
                    model.load_state_dict(state_dict, strict=False)
                    print(f"Loaded partial weights for {task}")
                
                # Move model to device and set to evaluation mode
                model.to(self.device)
                model.eval()
                
                # Store model, config, and mapping
                self.models[task] = model
                self.configs[task] = config
                self.reverse_mappings[task] = reverse_mapping
                print(f"Successfully loaded {task} model")
                
            except Exception as e:
                print(f"Failed to load {task} model: {str(e)}")
                import traceback
                traceback.print_exc()
                
    def predict_side(self, player_path, is_serve=False):
        """Predict forehand/backhand side"""
        # Serve is always forehand
        if is_serve:
            return "forehand"
        
        # If no player image, default to forehand
        if not player_path or not os.path.exists(player_path):
            return "forehand"
        
        # If model not loaded, default to forehand
        if "side" not in self.models:
            return "forehand"
        
        # Load and process the image
        try:
            with torch.no_grad():
                image = Image.open(player_path).convert('RGB')
                image_tensor = self.transform(image).unsqueeze(0).to(self.device)
                
                # Forward pass
                outputs = self.models["side"](image_tensor)
                _, predicted = torch.max(outputs, 1)
                
                # Get the label
                predicted_idx = predicted.item()
                return self.reverse_mappings["side"].get(predicted_idx, "forehand")
                
        except Exception as e:
            print(f"Error predicting side: {str(e)}")
            return "forehand"
    
    def predict_shot_type(self, player_path, is_serve=False, is_return=False):
        """Predict shot type (volley, lob, etc)"""
        # Handle fixed cases
        if is_serve:
            return "serve"
        if is_return:
            return "return"
        
        # If no player image or model, default to swing
        if not player_path or not os.path.exists(player_path) or "shot_type" not in self.models:
            return "swing"
        
        # Predict using the model
        try:
            with torch.no_grad():
                image = Image.open(player_path).convert('RGB')
                image_tensor = self.transform(image).unsqueeze(0).to(self.device)
                
                # Forward pass
                outputs = self.models["shot_type"](image_tensor)
                _, predicted = torch.max(outputs, 1)
                
                # Get the label
                predicted_idx = predicted.item()
                return self.reverse_mappings["shot_type"].get(predicted_idx, "swing")
                
        except Exception as e:
            print(f"Error predicting shot type: {str(e)}")
            return "swing"
    
    def predict_formation(self, player_path, partner_path, is_serve=False):
        """Predict formation (conventional, i-formation, etc)"""
        # Non-serve shots have a fixed formation
        if not is_serve:
            return "non-serve"
        
        # If missing images or model, default to conventional
        if not player_path or not os.path.exists(player_path) or \
           not partner_path or not os.path.exists(partner_path) or \
           "formation" not in self.models:
            return "conventional"
        
        # Predict using the dual image model
        try:
            with torch.no_grad():
                # Load and process player image
                player_img = Image.open(player_path).convert('RGB')
                player_tensor = self.transform(player_img).unsqueeze(0).to(self.device)
                
                # Load and process partner image
                partner_img = Image.open(partner_path).convert('RGB')
                partner_tensor = self.transform(partner_img).unsqueeze(0).to(self.device)
                
                # Forward pass
                outputs = self.models["formation"](player_tensor, partner_tensor)
                _, predicted = torch.max(outputs, 1)
                
                # Get the label
                predicted_idx = predicted.item()
                return self.reverse_mappings["formation"].get(predicted_idx, "conventional")
                
        except Exception as e:
            print(f"Error predicting formation: {str(e)}")
            return "conventional"
    
    def predict_direction(self, player_path, player_n_path, is_serve=False, court_position=None, side=None, handedness=None):
        """Predict shot direction"""
        # If serve, use serve_direction model
        if is_serve:
            if not player_path or not os.path.exists(player_path) or \
               "serve_direction" not in self.models:
                return "t"  # default serve direction
            
            try:
                with torch.no_grad():
                    # Load and process player image
                    player_img = Image.open(player_path).convert('RGB')
                    player_tensor = self.transform(player_img).unsqueeze(0).to(self.device)
                    
                    # Default to using the same image for player_n if not available
                    if not player_n_path or not os.path.exists(player_n_path):
                        player_n_tensor = player_tensor
                    else:
                        player_n_img = Image.open(player_n_path).convert('RGB')
                        player_n_tensor = self.transform(player_n_img).unsqueeze(0).to(self.device)
                    
                    # Forward pass
                    outputs = self.models["serve_direction"](player_tensor, player_n_tensor)
                    _, predicted = torch.max(outputs, 1)
                    
                    # Get the label
                    predicted_idx = predicted.item()
                    return self.reverse_mappings["serve_direction"].get(predicted_idx, "t")
            
            except Exception as e:
                print(f"Error predicting serve direction: {str(e)}")
                return "t"
        
        # If not serve, use shot_direction model
        else:
            # Default prediction logic
            predicted_direction = "cc"  # Default to cross-court
            
            if player_path and os.path.exists(player_path) and \
               player_n_path and os.path.exists(player_n_path) and \
               "shot_direction" in self.models:
                try:
                    with torch.no_grad():
                        # Load and process player image
                        player_img = Image.open(player_path).convert('RGB')
                        player_tensor = self.transform(player_img).unsqueeze(0).to(self.device)
                        
                        # Load and process player_n image
                        player_n_img = Image.open(player_n_path).convert('RGB')
                        player_n_tensor = self.transform(player_n_img).unsqueeze(0).to(self.device)
                        
                        # Forward pass
                        outputs = self.models["shot_direction"](player_tensor, player_n_tensor)
                        _, predicted = torch.max(outputs, 1)
                        
                        # Get the label
                        predicted_idx = predicted.item()
                        direction_type = self.reverse_mappings["shot_direction"].get(predicted_idx, "cross")
                        
                        # Convert to actual direction code
                        if direction_type == "cross":
                            predicted_direction = "cc"  # Cross-court
                        else:
                            predicted_direction = "dl"  # Down the line
                
                except Exception as e:
                    print(f"Error predicting shot direction: {str(e)}")
            
            # Apply tennis strategy rules based on handedness, court position, and side
            if court_position and side and handedness:
                return self.correct_direction_by_strategy(predicted_direction, court_position, side, handedness)
            else:
                return predicted_direction
    
    def correct_direction_by_strategy(self, predicted_direction, court_position, side, handedness):
        """Apply tennis strategy rules to correct predicted direction based on player position and handedness"""
        # Extract court side (deuce/ad)
        court_side = court_position.split("_")[1] if "_" in court_position else "deuce"
        
        # Rules for right-handed players
        if handedness == "right":
            if court_side == "deuce":
                if side == "forehand":
                    # Forehand from deuce court - typically CC or DL
                    return predicted_direction  # Use model prediction
                elif side == "backhand":
                    # Backhand from deuce court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "cc" else "io"
            elif court_side == "ad":
                if side == "forehand":
                    # Forehand from ad court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "cc" else "io"
                elif side == "backhand":
                    # Backhand from ad court - typically CC or DL
                    return predicted_direction  # Use model prediction
        
        # Rules for left-handed players (mirror of right-handed)
        elif handedness == "left":
            if court_side == "deuce":
                if side == "forehand":
                    # Forehand from deuce court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "cc" else "io"
                elif side == "backhand":
                    # Backhand from deuce court - typically CC or DL
                    return predicted_direction  # Use model prediction
            elif court_side == "ad":
                if side == "forehand":
                    # Forehand from ad court - typically CC or DL
                    return predicted_direction  # Use model prediction
                elif side == "backhand":
                    # Backhand from ad court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "cc" else "io"
        
        # For unknown handedness or other cases, use the model prediction
        return predicted_direction
    
    def predict_outcome(self, player_path, player_n_path, is_last_shot=False):
        """Predict shot outcome (in, err, win)"""
        # If not the last shot, it's always 'in'
        if not is_last_shot:
            return "in"
        
        # If missing images or model, default to err
        if not player_path or not os.path.exists(player_path) or \
           not player_n_path or not os.path.exists(player_n_path) or \
           "outcome" not in self.models:
            return "err"
        
        # Predict using the dual image model
        try:
            with torch.no_grad():
                # Load and process player image
                player_img = Image.open(player_path).convert('RGB')
                player_tensor = self.transform(player_img).unsqueeze(0).to(self.device)
                
                # Load and process player_n image
                player_n_img = Image.open(player_n_path).convert('RGB')
                player_n_tensor = self.transform(player_n_img).unsqueeze(0).to(self.device)
                
                # Forward pass
                outputs = self.models["outcome"](player_tensor, player_n_tensor)
                _, predicted = torch.max(outputs, 1)
                
                # Get the label
                predicted_idx = predicted.item()
                return self.reverse_mappings["outcome"].get(predicted_idx, "err")
                
        except Exception as e:
            print(f"Error predicting outcome: {str(e)}")
            return "err"
    
    def generate_shot_labels(self, hitting_moments, rallies_data, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        # Get net position from rally data if available
        net_position = rallies_data.get("netPosition", None)
        
        # Extract video_id from rallies_data
        video_id = rallies_data.get('video_id')
        if not video_id and hitting_moments and len(hitting_moments) > 0:
            # Try to get from hitting moments
            for key in ['videoId', 'video_id', 'video']:
                if key in hitting_moments[0]:
                    video_id = hitting_moments[0][key]
                    break
            
            # Last resort - try to extract from frame path
            if not video_id and 'framePath' in hitting_moments[0]:
                frame_path = hitting_moments[0]['framePath']
                parts = frame_path.split('/')
                if len(parts) >= 3:
                    video_id = parts[-2]
        
        if not video_id:
            return {"error": "Could not determine video ID", "events": []}
        
        # Load bbox data for the video
        try:
            # Set video_id to ensure bbox file is found
            self.set_video(video_id)
            if not os.path.exists(self.bbox_file):
                return {"error": f"Bbox file not found for video {video_id}", "events": []}
            
            # Load bbox data
            with open(self.bbox_file, 'r') as f:
                bbox_data = json.load(f)
        
        except Exception as e:
            return {"error": f"Failed to load bbox data: {str(e)}", "events": []}
        
        # Generate events for each hitting moment
        events = []
        n = len(hitting_moments)
        
        for i, moment in enumerate(hitting_moments):
            try:
                # Extract frame number
                frame_number = None
                if 'frameNumber' in moment:
                    frame_number = moment['frameNumber']
                elif 'frame' in moment:
                    frame_number = moment['frame']
                
                if frame_number is None:
                    continue
                
                # Determine shot type parameters
                is_serve = (i == 0)
                is_return = (i == 1)
                is_last_shot = (i == n - 1)
                
                # Get next moment for n-frames later prediction
                next_moment = hitting_moments[i+1] if i < n - 1 else None
                
                # Get player ID (p1, p2, etc.)
                player_id = self.get_player_from_hitting_moment(moment)
                
                # Get player handedness
                handedness = self.get_player_handedness(player_id, categories)
                
                # Use the base class method to extract player images
                player_path, partner_path, player_n_path = self.extract_player_images(
                    video_id, frame_number, moment, next_moment, bbox_data
                )
                
                # Get player position
                player_position = moment.get("playerPosition", None)
                
                # Determine court position
                court_position = ShotLabellingModel.get_court_position(net_position, player_position)
                
                # Predict shot components
                side = self.predict_side(player_path, is_serve)
                shot_type = self.predict_shot_type(player_path, is_serve, is_return)
                formation = self.predict_formation(player_path, partner_path, is_serve)
                direction = self.predict_direction(
                    player_path, 
                    player_n_path, 
                    is_serve, 
                    court_position, 
                    side, 
                    handedness
                )
                outcome = self.predict_outcome(player_path, player_n_path, is_last_shot)
                
                # Create label following the format
                label = f"{court_position}_{side}_{shot_type}_{direction}_{formation}_{outcome}"
                
                # Add event with all available data
                event = {
                    "player": player_id,
                    "frame": frame_number,
                    "label": label,
                    "outcome": outcome,
                    "handedness": handedness
                }
                
                # Add additional data if available
                if player_position:
                    event["player_position"] = player_position
                
                events.append(event)
            
            except Exception as e:
                # Continue to next shot
                continue
        
        if not events:
            return {"error": "Failed to generate any valid events", "events": []}
        
        # Create rally output
        rally_labels = {
            "player_descriptons": player_descriptions,
            "events": events
        }
        
        if net_position:
            rally_labels["net_position"] = net_position
        
        return rally_labels