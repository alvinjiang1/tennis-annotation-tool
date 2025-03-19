import cv2
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import json
import os
from models.shot_labelling.shot_labelling_model import ShotLabellingModel
import torchvision.models as models

DATA_DIR = "data"
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
        super().__init__(id="cnn")
        
        self.name = "CNN Shot Predictor"
        self.description = "CNN-based shot label generator using trained models"
        
        # Image extraction related paths        
        self.cnn_data_dir = os.path.join(DATA_DIR, "cnn")

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
                
    def extract_player_images(self, video_id, frame_number, moment, next_moment, bbox_data=None):
        """Extract and save player images for CNN input"""
        print(f"Extracting player images from {video_id} for frame {frame_number}")
        # Load bbox data if not provided
        if bbox_data is None:
            if not hasattr(self, 'bbox_file') or not self.bbox_file or not os.path.exists(self.bbox_file):
                print(f"No bbox file found: {getattr(self, 'bbox_file', 'Not set')}")
                return None, None, None
                
            try:
                with open(self.bbox_file, 'r') as f:
                    bbox_data = json.load(f)
                    print(f"Loaded bbox data with {len(bbox_data)} entries")
                    # Print first few keys to debug
                    print(f"Sample bbox keys: {list(bbox_data.keys())[:5]}")
            except Exception as e:
                print(f"Error reading bbox file: {e}")
                return None, None, None
                
        # Create output directories
        cnn_data_dir = os.path.join(self.cnn_data_dir, video_id)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_player"), exist_ok=True)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_partner"), exist_ok=True)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_player_n"), exist_ok=True)
        
        # Get categories to map player IDs to labels
        categories = self.get_categories()
        
        # Get player ID and label
        player_id = None
        player_label = None
        
        if "playerId" in moment:
            player_id = moment["playerId"]
            # Find corresponding label from categories
            for category in categories:
                if category.get('id') == player_id:
                    player_label = category.get('name')
                    break
        elif "boundingBoxes" in moment:
            for box in moment["boundingBoxes"]:
                if "category_id" in box:
                    player_id = box["category_id"]
                    if "label" in box:
                        player_label = box["label"]
                    break
                    
        if player_id is None and player_label is None:
            print("No player ID or label found")
            
            # Fallback to position-based method
            player_position = moment.get("playerPosition", None)
            if not player_position:
                print("No player position found")
                return None, None, None
            
            # Try different frame key formats
            frame_key = self._find_frame_key(bbox_data, frame_number)
            if not frame_key:
                print(f"No matching frame key found for frame {frame_number}")
                return None, None, None
                
            frame_data = bbox_data[frame_key]
            bboxes = self._get_bboxes_from_data(frame_data)
            
            if not bboxes or len(bboxes) == 0:
                print(f"No valid bounding boxes found for frame {frame_key}")
                return None, None, None
                
            # Use position-based method as fallback
            hitting_player, hitting_partner = self._find_hitting_players(bboxes, player_position)
            if hitting_player == -1:
                print("No hitting player found")
                return None, None, None
                
            player_bbox = bboxes[hitting_player]
            partner_bbox = bboxes[hitting_partner] if hitting_partner != -1 else None
        else:
            # Try different frame key formats
            frame_key = self._find_frame_key(bbox_data, frame_number)
            if not frame_key:
                print(f"No matching frame key found for frame {frame_number}")
                return None, None, None
                
            frame_data = bbox_data[frame_key]
            
            # Find player and partner by ID and label
            hitting_player_idx, hitting_partner_idx = self._find_hitting_players_by_id(frame_data, player_id, categories)
            
            if hitting_player_idx == -1:
                print(f"Player with ID {player_id} not found in frame {frame_number}")
                
                # Try searching by label if available
                if player_label:
                    print(f"Trying to find player by label: {player_label}")
                    for i, box_data in enumerate(frame_data):
                        if "label" in box_data and box_data["label"] == player_label:
                            hitting_player_idx = i
                            break
                
                # If still not found, try position as fallback
                if hitting_player_idx == -1:
                    player_position = moment.get("playerPosition", None)
                    if player_position:
                        bboxes = self._get_bboxes_from_data(frame_data)
                        hitting_player = self._find_hitting_player(bboxes, player_position)
                        if hitting_player != -1:
                            player_bbox = bboxes[hitting_player]
                        else:
                            print("Player not found by position")
                            return None, None, None
                    else:
                        print("No player position found")
                        return None, None, None
                else:
                    player_bbox = self._get_bbox_from_data(frame_data[hitting_player_idx])
            else:
                player_bbox = self._get_bbox_from_data(frame_data[hitting_player_idx])
                # Store the player's label for future frame lookup
                if "label" in frame_data[hitting_player_idx]:
                    player_label = frame_data[hitting_player_idx]["label"]
                
            partner_bbox = None
            if hitting_partner_idx != -1:
                partner_bbox = self._get_bbox_from_data(frame_data[hitting_partner_idx])
        
        # Extract player image
        player_path = self._extract_player(
            video_id, 
            frame_number, 
            player_bbox, 
            "hitting_player"
        )
        
        # Extract partner image if found
        partner_path = None
        if partner_bbox is not None:
            partner_path = self._extract_player(
                video_id, 
                frame_number, 
                partner_bbox, 
                "hitting_partner"
            )
        
        # Process player in n=10 frames later
        player_n_path = None
        n_frames = 10  # Look exactly 10 frames ahead
        
        target_frame = frame_number + n_frames
        target_frame_key = self._find_frame_key(bbox_data, target_frame)
        
        if target_frame_key:
            target_frame_data = bbox_data[target_frame_key]
            player_n_idx = -1
            
            # First try to find the player by label if available
            if player_label:
                for i, box_data in enumerate(target_frame_data):
                    if "label" in box_data and box_data["label"] == player_label:
                        player_n_idx = i
                        break
            
            # If not found by label, try by ID
            if player_n_idx == -1 and player_id is not None:
                player_n_idx, _ = self._find_hitting_players_by_id(target_frame_data, player_id, categories)
            
            # If still not found and have next_moment, try using position
            if player_n_idx == -1 and next_moment and "playerPosition" in next_moment:
                next_player_position = next_moment.get("playerPosition")
                if next_player_position:
                    bboxes = self._get_bboxes_from_data(target_frame_data)
                    player_n_idx = self._find_hitting_player(bboxes, next_player_position)
            
            # Extract frame if found
            if player_n_idx != -1:
                player_n_bbox = self._get_bbox_from_data(target_frame_data[player_n_idx])
                player_n_path = self._extract_player(
                    video_id, 
                    target_frame, 
                    player_n_bbox, 
                    "hitting_player_n"
                )
            else:
                print(f"Player not found in frame {target_frame}")
        
        return player_path, partner_path, player_n_path
    
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
                side = self.reverse_mappings["side"].get(predicted_idx, "forehand")
                print(f'Predicted side: {side}')
                return side
                    
        except Exception as e:
            print(f"Error predicting side: {str(e)}")
            return "forehand"
    
    def _extract_player(self, video_id, frame_number, bbox, output_type):
        """Extract player from image using bounding box and save to file"""
        # Get path to frame
        frames_dir = os.path.join(self.raw_frames_dir, video_id)
        
        # Try different frame naming formats
        frame_formats = [
            f"{frame_number:04d}.jpg",
            f"{frame_number:06d}.jpg",
            f"frame_{frame_number:04d}.jpg",
            f"frame_{frame_number:06d}.jpg"
        ]
        
        frame_path = None
        for fmt in frame_formats:
            path = os.path.join(frames_dir, fmt)
            if os.path.exists(path):
                frame_path = path
                break
                
        if not frame_path:
            return None
        
        # Define output path
        output_dir = os.path.join(self.cnn_data_dir, video_id, output_type)
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"frame_{frame_number:04d}.jpg")
        
        try:
            # Read the image
            image = cv2.imread(frame_path)
            if image is None:
                return None
            
            # Update width/height based on actual image dimensions
            self.width, self.height = image.shape[1], image.shape[0]
            
            # Extract bbox coordinates
            x_min, y_min, x_max, y_max = bbox
            
            # Scale the bbox by 2x while keeping the center
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            width = x_max - x_min
            height = y_max - y_min
            
            # Double the size
            new_width = width * 2
            new_height = height * 2
            
            # Calculate new bbox with bounds checking
            x_min_new = max(0, int(center_x - new_width / 2))
            y_min_new = max(0, int(center_y - new_height / 2))
            x_max_new = min(self.width, int(center_x + new_width / 2))
            y_max_new = min(self.height, int(center_y + new_height / 2))
            
            # Crop the image with the expanded bbox
            crop = image[y_min_new:y_max_new, x_min_new:x_max_new]
            
            if crop.size == 0:
                return None
                
            # Resize to 224x224 for CNN input
            resized = cv2.resize(crop, (224, 224))
            
            # Save the cropped image
            cv2.imwrite(output_path, resized)
            
            return output_path
            
        except Exception as e:
            print(f"Error extracting player: {e}")
            return None

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
                shot_type = self.reverse_mappings["shot_type"].get(predicted_idx, "swing")
                print(f'Predicted shot type: {shot_type}')
                return shot_type
                
        except Exception as e:
            print(f"Error predicting shot type: {str(e)}")
            return "swing"
    
    def predict_formation(self, player_path, partner_path, is_serve=False):
        """Predict formation (conventional, i-formation, etc)"""
        # Non-serve shots have a fixed formation
        if not is_serve:
            print(f"Formation: Non-serve")
            return "non-serve"
        
        # If missing images or model, default to conventional
        if not player_path or not os.path.exists(player_path) or \
           not partner_path or not os.path.exists(partner_path) or \
           "formation" not in self.models:
            print("Missing player or partner image or model, using conventional")
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
                formation = self.reverse_mappings["formation"].get(predicted_idx, "conventional")
                print(f"Predicted formation: {formation} with outputs: {outputs}")
                return formation
                
        except Exception as e:
            print(f"Error predicting formation: {str(e)}, using conventional")
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
                    serve_direction = self.reverse_mappings["serve_direction"].get(predicted_idx, "t")
                    print(f"Predicted serve direction: {serve_direction}")
                    return serve_direction
            
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
                        print(f"Predicted shot direction type: {direction_type}")
                        
                        # Convert to actual direction code
                        if direction_type == "cross":
                            predicted_direction = "cc"  # Cross-court
                        else:
                            predicted_direction = "dl"  # Down the line
                
                except Exception as e:
                    print(f"Error predicting shot direction: {str(e)}")
            
            # Apply tennis strategy rules based on handedness, court position, and side
            if court_position and side and handedness:
                correct_direction = self.correct_direction_by_strategy(predicted_direction, court_position, side, handedness)
                print(f'court_position: {court_position}, side: {side}, handedness: {handedness},  initial direction: {predicted_direction}, correct_direction: {correct_direction}')
                return correct_direction
            else:
                print(f'no court_position, side, or handedness')
                return predicted_direction
    
    def correct_direction_by_strategy(self, predicted_direction, court_position, side, handedness):
        """Apply tennis strategy rules to correct predicted direction based on player position and handedness"""
        # Extract court side (deuce/ad)st
        court_side = court_position.split("_")[1] if "_" in court_position else "deuce"
        
        # Rules for right-handed players
        if handedness == "right":
            if court_side == "deuce":
                if side == "forehand":
                    # Forehand from deuce court - typically CC or DL
                    return predicted_direction  # Use model prediction
                elif side == "backhand":
                    # Backhand from deuce court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "dl" else "io"
            elif court_side == "ad":
                if side == "forehand":
                    # Forehand from ad court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "dl" else "io"
                elif side == "backhand":
                    # Backhand from ad court - typically CC or DL
                    return predicted_direction  # Use model prediction
        
        # Rules for left-handed players (mirror of right-handed)
        elif handedness == "left":
            if court_side == "deuce":
                if side == "forehand":
                    # Forehand from deuce court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "dl" else "io"
                elif side == "backhand":
                    # Backhand from deuce court - typically CC or DL
                    return predicted_direction  # Use model prediction
            elif court_side == "ad":
                if side == "forehand":
                    # Forehand from ad court - typically CC or DL
                    return predicted_direction  # Use model prediction
                elif side == "backhand":
                    # Backhand from ad court - typically inside-in or inside-out
                    return "ii" if predicted_direction == "dl" else "io"
        
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
                outcome = self.reverse_mappings["outcome"].get(predicted_idx, "err")
                print(f"Predicted outcome: {outcome}")
                return outcome
                
        except Exception as e:
            print(f"Error predicting outcome: {str(e)}")
            return "err"
    
    def generate_shot_labels(self, hitting_moments, rally_info, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        # Get net position from rally data if available
        net_position = self.net_position
        
        # Extract video_id
        video_id = self.video_id
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