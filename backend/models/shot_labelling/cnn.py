import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import cv2
import json
import os
from models.shot_labelling.shot_labelling_model import ShotLabellingModel

# Single Image CNN (for shot_type, side)
class TennisCNN(nn.Module):
    def __init__(self, num_classes):
        super(TennisCNN, self).__init__()
        # Use a pre-trained ResNet model
        self.backbone = torch.hub.load('pytorch/vision:v0.10.0', 'resnet50', pretrained=False)
        
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
    def __init__(self, num_classes):
        super(DualImageTennisCNN, self).__init__()
        # Create two separate backbones for player and partner/n-frames
        self.player_backbone = torch.hub.load('pytorch/vision:v0.10.0', 'resnet50', pretrained=False)
        self.partner_backbone = torch.hub.load('pytorch/vision:v0.10.0', 'resnet50', pretrained=False)
        
        self.player_features = nn.Sequential(*list(self.player_backbone.children())[:-1])
        self.partner_features = nn.Sequential(*list(self.partner_backbone.children())[:-1])
        
        # Get feature dimensions (2048 for ResNet50)
        self.feature_dim = 2048
        
        self.classifier = nn.Sequential(
            nn.Linear(self.feature_dim * 2, 512),  # Combine features from both inputs
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
        self.cnn_dir = os.path.join("backend", "models", "shot_labelling", "cnn")
        
        # Initialize model storage
        self.models = {}
        self.configs = {}
        self.reverse_mappings = {}
        
        # Load all models
        self.load_models()
    
    def load_models(self):
        """Load all CNN models with their weights and configurations"""
        tasks = ["shot_type", "side", "formation", "shot_direction", "serve_direction", "outcome", "is_serve"]
        
        for task in tasks:
            try:
                # Load hyperparameters
                hyperparams_path = os.path.join(self.cnn_dir, task, "hyperparameters.json")
                if os.path.exists(hyperparams_path):
                    with open(hyperparams_path, 'r') as f:
                        config = json.load(f)
                    
                    # Get class mappings
                    class_mappings = config.get("class_mappings", {})
                    num_classes = len(class_mappings)
                    
                    # Create reverse mapping (index to label)
                    reverse_mapping = {v: k for k, v in class_mappings.items()}
                    
                    # Initialize the appropriate model based on config
                    if config.get("model") == "DualImageResNet50":
                        model = DualImageTennisCNN(num_classes)
                    else:  # Default to ResNet50
                        model = TennisCNN(num_classes)
                    
                    # Load weights if they exist
                    model_path = os.path.join(self.cnn_dir, task, "best_model.pth")
                    if os.path.exists(model_path):
                        model.load_state_dict(torch.load(model_path, map_location=self.device))
                        model.to(self.device)
                        model.eval()
                        
                        # Store model, config, and reverse mapping
                        self.models[task] = model
                        self.configs[task] = config
                        self.reverse_mappings[task] = reverse_mapping
                        print(f"Loaded {task} model with {num_classes} classes")
                    else:
                        print(f"Warning: Weights file not found for {task} at {model_path}")
                else:
                    print(f"Warning: Hyperparameters file not found for {task} at {hyperparams_path}")
            
            except Exception as e:
                print(f"Error loading {task} model: {str(e)}")
    
    def save_player_data(self, video_id, frame_number, moment, next_moment, bbox_data):
        """Extract and save player images for CNN input"""
        # Create directories if they don't exist
        cnn_data_dir = os.path.join("data", "cnn", video_id)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_player"), exist_ok=True)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_partner"), exist_ok=True)
        os.makedirs(os.path.join(cnn_data_dir, "hitting_player_n"), exist_ok=True)
        
        # Get player position
        player_position = moment.get("playerPosition", None)
        if not player_position:
            return None, None, None
        
        # Get bounding boxes for current frame
        frame_key = f"{frame_number}"
        bboxes = self._get_bboxes(bbox_data.get(frame_key, []))
        
        if not bboxes or len(bboxes) == 0:
            return None, None, None
        
        # Find hitting player and partner
        hitting_player, hitting_partner = self._find_hitting_players(bboxes, player_position)
        
        if hitting_player == -1:
            return None, None, None
        
        # If next_moment is provided, find player in next frame (for n frames later)
        player_n_path = None
        if next_moment:
            next_frame_number = next_moment.get("frameNumber", frame_number + 10)
            next_frame_key = f"{next_frame_number}"
            next_bboxes = self._get_bboxes(bbox_data.get(next_frame_key, []))
            
            if next_bboxes and len(next_bboxes) > 0:
                next_player_position = next_moment.get("playerPosition", player_position)
                hitting_player_n = self._find_hitting_player(next_bboxes, next_player_position)
                
                if hitting_player_n != -1:
                    # Extract and save the player image for frame n
                    player_n_path = self._extract_player(
                        video_id, 
                        next_frame_number, 
                        next_bboxes[hitting_player_n], 
                        "hitting_player_n"
                    )
        
        # Extract and save player images
        player_path = self._extract_player(
            video_id, 
            frame_number, 
            bboxes[hitting_player], 
            "hitting_player"
        )
        
        partner_path = None
        if hitting_partner != -1:
            partner_path = self._extract_player(
                video_id, 
                frame_number, 
                bboxes[hitting_partner], 
                "hitting_partner"
            )
        
        return player_path, partner_path, player_n_path
    
    def _get_bboxes(self, frame_data):
        """Extract bounding boxes from frame data"""
        if not frame_data:
            return []
            
        all_bboxes = []
        for item in frame_data:
            # Get bbox in [x_min, y_min, x_max, y_max] format
            if 'bbox' in item:
                bbox = item['bbox']
                # Handle different bbox formats
                if len(bbox) == 4:
                    if isinstance(bbox[2], int) and bbox[2] > bbox[0]:  # Already [x1,y1,x2,y2] format
                        all_bboxes.append(bbox)
                    else:  # [x,y,width,height] format
                        x_min, y_min, width, height = bbox
                        all_bboxes.append([x_min, y_min, x_min + width, y_min + height])
        
        return all_bboxes
    
    def _find_hitting_players(self, bboxes, player_position):
        """Find the hitting player and their partner based on positions"""
        if len(bboxes) == 0:
            return -1, -1
        
        # Ensure player_position is in the right format
        if isinstance(player_position, dict):
            position_x, position_y = player_position.get('x', 0), player_position.get('y', 0)
        else:  # Assume it's a list/array/tuple
            position_x, position_y = player_position[0], player_position[1]
        
        # Calculate center points of all bounding boxes
        bbox_centers = []
        for bbox in bboxes:
            x_min, y_min, x_max, y_max = bbox
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            bbox_centers.append([center_x, center_y])
        
        # Find closest player to the provided position
        min_distance = float('inf')
        hitting_player_idx = -1
        
        for i, center in enumerate(bbox_centers):
            distance = np.sqrt((center[0] - position_x)**2 + (center[1] - position_y)**2)
            if distance < min_distance:
                min_distance = distance
                hitting_player_idx = i
        
        # If we found a hitting player, find the closest partner
        if hitting_player_idx != -1:
            min_partner_distance = float('inf')
            hitting_partner_idx = -1
            
            for i, center in enumerate(bbox_centers):
                if i != hitting_player_idx:
                    # Find closest player on x-axis
                    distance = abs(center[0] - bbox_centers[hitting_player_idx][0])
                    if distance < min_partner_distance:
                        min_partner_distance = distance
                        hitting_partner_idx = i
            
            return hitting_player_idx, hitting_partner_idx
        
        return -1, -1
    
    def _find_hitting_player(self, bboxes, player_position):
        """Find the index of the closest player to the given position"""
        if len(bboxes) == 0:
            return -1
        
        # Ensure player_position is in the right format
        if isinstance(player_position, dict):
            position_x, position_y = player_position.get('x', 0), player_position.get('y', 0)
        else:  # Assume it's a list/array/tuple
            position_x, position_y = player_position[0], player_position[1]
        
        # Calculate bbox centers
        bbox_centers = []
        for bbox in bboxes:
            x_min, y_min, x_max, y_max = bbox
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            bbox_centers.append([center_x, center_y])
        
        # Find closest center to player position
        min_distance = float('inf')
        closest_idx = -1
        
        for i, center in enumerate(bbox_centers):
            distance = np.sqrt((center[0] - position_x)**2 + (center[1] - position_y)**2)
            if distance < min_distance:
                min_distance = distance
                closest_idx = i
        
        return closest_idx
    
    def _extract_player(self, video_id, frame_number, bbox, output_type):
        """Extract player from image using bounding box and save to file"""
        # Define paths
        frames_dir = os.path.join("data", "raw_frames", video_id)
        
        # Try different frame naming formats
        frame_formats = [
            f"{frame_number:04d}.jpg",  # 4-digit format
            f"{frame_number:06d}.jpg",  # 6-digit format
            f"frame_{frame_number:04d}.jpg",  # frame_NNNN format
            f"frame_{frame_number:06d}.jpg"   # frame_NNNNNN format
        ]
        
        frame_path = None
        for fmt in frame_formats:
            path = os.path.join(frames_dir, fmt)
            if os.path.exists(path):
                frame_path = path
                break
                
        if not frame_path:
            print(f"Frame not found for {video_id}, frame {frame_number}")
            return None
        
        # Output path
        output_dir = os.path.join("data", "cnn", video_id, output_type)
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"frame_{frame_number:04d}.jpg")
        
        try:
            # Read the image
            image = cv2.imread(frame_path)
            if image is None:
                print(f"Failed to read image: {frame_path}")
                return None
            
            # Extract bounding box
            x_min, y_min, x_max, y_max = bbox
            
            # Add padding around the box (50% bigger)
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            width = x_max - x_min
            height = y_max - y_min
            
            # Scale by 1.5x
            new_width = width * 1.5
            new_height = height * 1.5
            
            # Calculate new bbox with padding
            x_min_new = max(0, int(center_x - new_width / 2))
            y_min_new = max(0, int(center_y - new_height / 2))
            x_max_new = min(image.shape[1], int(center_x + new_width / 2))
            y_max_new = min(image.shape[0], int(center_y + new_height / 2))
            
            # Crop the image
            crop = image[y_min_new:y_max_new, x_min_new:x_max_new]
            
            if crop.size == 0:
                print(f"Error: Empty crop from bbox {bbox}")
                return None
                
            # Resize to 224x224 for CNN
            resized = cv2.resize(crop, (224, 224))
            
            # Save the image
            cv2.imwrite(output_path, resized)
            
            return output_path
            
        except Exception as e:
            print(f"Error extracting player: {str(e)}")
            return None
    
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
        print("\n==== Generating Shot Labels with CNN Model ====")
        
        # Get net position from rally data if available
        net_position = rallies_data.get("netPosition", None)
        print(f"Net Position: {net_position}")
        
        # Load bbox data for the video
        try:
            # Try to extract video ID - could be in different formats
            video_id = None
            if hitting_moments and len(hitting_moments) > 0:
                # Try different possible keys for video ID
                for key in ['videoId', 'video_id', 'video']:
                    if key in hitting_moments[0]:
                        video_id = hitting_moments[0][key]
                        break
                
                # If still not found, check if it's in the rally data
                if not video_id and 'video_id' in rallies_data:
                    video_id = rallies_data['video_id']
                
                # Last resort: try to parse from the first frame path if available
                if not video_id and 'framePath' in hitting_moments[0]:
                    frame_path = hitting_moments[0]['framePath']
                    # Extract from path format like "data/frames/video_id/frame_12345.jpg"
                    parts = frame_path.split('/')
                    if len(parts) >= 3:
                        video_id = parts[-2]  # Assuming video_id is the second-to-last part
            
            if not video_id:
                print("ERROR: Could not determine video ID from hitting moments or rally data")
                return {"error": "Could not determine video ID", "events": []}
            
            print(f"Processing video ID: {video_id}")
            
            # Path to bbox JSON file
            bbox_file = os.path.join("data", "bbox", f"{video_id}_boxes.json")
            if not os.path.exists(bbox_file):
                print(f"ERROR: Bbox file not found: {bbox_file}")
                
                # Try alternative paths
                alt_paths = [
                    os.path.join("data", "bbox", f"{video_id}.json"),
                    os.path.join("backend", "data", "bbox", f"{video_id}_boxes.json")
                ]
                
                bbox_file = None
                for path in alt_paths:
                    if os.path.exists(path):
                        bbox_file = path
                        print(f"Found alternative bbox file: {bbox_file}")
                        break
                
                if not bbox_file:
                    return {"error": f"Bbox file not found for video {video_id}", "events": []}
            
            # Load bbox data
            with open(bbox_file, 'r') as f:
                bbox_data = json.load(f)
                print(f"Loaded bbox data with {len(bbox_data)} entries")
        
        except Exception as e:
            print(f"ERROR: Failed to load bbox data: {str(e)}")
            return {"error": f"Failed to load bbox data: {str(e)}", "events": []}
        
        # Generate events for each hitting moment
        events = []
        n = len(hitting_moments)
        print(f"Processing {n} hitting moments in rally")
        
        for i, moment in enumerate(hitting_moments):
            print(f"\n--- Processing Shot {i+1}/{n} ---")
            
            try:
                # Extract frame number
                frame_number = None
                if 'frameNumber' in moment:
                    frame_number = moment['frameNumber']
                elif 'frame' in moment:
                    frame_number = moment['frame']
                
                if frame_number is None:
                    print(f"WARNING: No frame number found for shot {i+1}")
                    continue
                
                print(f"Frame number: {frame_number}")
                
                # Get player position
                player_position = moment.get("playerPosition", None)
                if not player_position:
                    print(f"WARNING: No player position for shot {i+1}")
                
                # Determine shot type parameters
                is_serve = (i == 0)
                is_return = (i == 1)
                is_last_shot = (i == n - 1)
                print(f"Shot type: {'Serve' if is_serve else 'Return' if is_return else 'Regular'}")
                print(f"Is last shot: {is_last_shot}")
                
                # Get next moment for n-frames later prediction
                next_moment = hitting_moments[i+1] if i < n - 1 else None
                
                # Get player ID (p1, p2, etc.)
                player_id = self.get_player_from_hitting_moment(moment)
                print(f"Player ID: {player_id}")
                
                # Get player handedness
                handedness = self.get_player_handedness(player_id, categories)
                print(f"Player handedness: {handedness}")
                
                # Save player data for CNN input
                player_path, partner_path, player_n_path = self.save_player_data(
                    video_id, frame_number, moment, next_moment, bbox_data
                )
                
                print(f"Player image: {player_path if player_path else 'Not available'}")
                print(f"Partner image: {partner_path if partner_path else 'Not available'}")
                print(f"Player n-frames image: {player_n_path if player_n_path else 'Not available'}")
                
                # Determine court position
                court_position = ShotLabellingModel.get_court_position(net_position, player_position)
                print(f"Court position: {court_position}")
                
                # Predict shot components
                side = self.predict_side(player_path, is_serve)
                print(f"Predicted side: {side}")
                
                shot_type = self.predict_shot_type(player_path, is_serve, is_return)
                print(f"Predicted shot type: {shot_type}")
                
                # Get formation - only relevant for serves
                formation = self.predict_formation(player_path, partner_path, is_serve)
                print(f"Predicted formation: {formation}")
                
                # Predict direction (with tennis strategy correction)
                direction = self.predict_direction(
                    player_path, 
                    player_n_path, 
                    is_serve, 
                    court_position, 
                    side, 
                    handedness
                )
                print(f"Predicted direction: {direction}")
                
                # Predict outcome - only the last shot can be an error or winner
                outcome = self.predict_outcome(player_path, player_n_path, is_last_shot)
                print(f"Predicted outcome: {outcome}")
                
                # Create label following the format: court_position_side_shot_type_direction_formation_outcome
                # e.g. near_deuce_forehand_serve_t_conventional_in
                label = f"{court_position}_{side}_{shot_type}_{direction}_{formation}_{outcome}"
                print(f"Final label: {label}")
                
                # Add event with all available data
                event = {
                    "player": player_id,
                    "frame": frame_number,
                    "label": label,
                    "outcome": outcome,
                    "handedness": handedness
                }
                
                # Add additional data if available (position, bbox, etc.)
                if player_position:
                    event["player_position"] = player_position
                
                events.append(event)
            
            except Exception as e:
                print(f"ERROR in shot {i+1}: {str(e)}")
                # Continue to next shot instead of failing the whole rally
        
        if not events:
            print("WARNING: No valid events were generated")
            return {"error": "Failed to generate any valid events", "events": []}
        
        # Create rally output
        rally_labels = {
            "player_descriptons": player_descriptions,
            "events": events
        }
        
        if net_position:
            rally_labels["net_position"] = net_position
        
        print(f"Successfully generated {len(events)} shot labels")
        print("==== Shot Label Generation Complete ====\n")
        return rally_labels