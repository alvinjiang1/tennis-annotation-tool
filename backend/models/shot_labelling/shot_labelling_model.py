import json
import os
import random
import cv2
import numpy as np
from flask import jsonify

DATA_DIR = "data"
POSSIBLE_SHOT_DIRECTIONS = {
    'left': {
        'forehand': {
            'deuce_ad': 'II',
            'deuce_deuce': 'IO',
            'ad_ad': 'CC',
            'ad_deuce': 'DL'
        }, 'backhand': {
            'deuce_ad': 'DL',
            'deuce_deuce': 'CC',
            'ad_ad': 'IO',
            'ad_deuce': 'II'
        }
    },
    'right': {
        'forehand': {
            'deuce_ad': 'DL',
            'deuce_deuce': 'CC',
            'ad_ad': 'IO',
            'ad_deuce': 'II'
        }, 'backhand': {
            'deuce_ad': 'II',
            'deuce_deuce': 'IO',
            'ad_ad': 'CC',
            'ad_deuce': 'DL'
        }
    }   
}

class ShotLabellingModel:    
    
    @staticmethod
    def get_court_position(net_position, player_position):
        """Determine court position based on player's position relative to net"""        
        if not net_position or not player_position:
            return random.choice(["near_deuce", "near_ad", "far_deuce", "far_ad"])
        is_near = player_position.get('y', 0) > net_position.get('y', 0)
        is_deuce = player_position.get('x', 0) < net_position.get('x', 0)
        
        if is_near:
            return "near_deuce" if is_deuce else "near_ad"
        else:
            return "far_deuce" if is_deuce else "far_ad"      
    
    @staticmethod
    def get_shot_direction(handedness, side, start, end):
        if ("near" in start and "near" in end) or ("far" in start and "far" in end):
            raise Exception('Start and end positions cannot be on the same side')
        start_court_pos = "ad" if "ad" in start else "deuce"
        end_court_pos = "ad" if "ad" in end else "deuce"
        return POSSIBLE_SHOT_DIRECTIONS[handedness][side][f'{start_court_pos}_{end_court_pos}']      

    def __init__(self, id="random", rallies_path="rallies",
            output_path="generated_labels", pose_coordinates_path="pose_coordinates", 
            annotations_path="annotations"):
        self.id = id
        self.rallies_path = os.path.join(DATA_DIR, rallies_path)
        self.output_path = os.path.join(DATA_DIR, output_path)
        self.pose_coordinates_path = os.path.join(DATA_DIR, pose_coordinates_path)
        self.annotations_path = os.path.join(DATA_DIR, annotations_path)
        self.shot_generator_function = None
        
        # Image extraction related paths
        self.raw_frames_dir = os.path.join(DATA_DIR, "raw_frames")
        self.bbox_dir = os.path.join(DATA_DIR, "bbox")
        self.cnn_data_dir = os.path.join(DATA_DIR, "cnn")
        
        # Default image size for scaling calculations
        self.width = 1280
        self.height = 720

        os.makedirs(self.output_path, exist_ok=True)

    def set_video(self, video_id):
        """Sets the video specific file paths"""
        self.annotations_file = os.path.join(self.annotations_path, f"{video_id}_coco_annotations.json")
        self.rallies_file = os.path.join(self.rallies_path, f'{video_id}_rallies.json')
        self.pose_coordinates_file = os.path.join(self.pose_coordinates_path, f'{video_id}_pose.json')
        self.output_file = os.path.join(self.output_path, f'{video_id}_labelled.json')
        self.bbox_file = os.path.join(self.bbox_dir, f"{video_id}_boxes.json")

    def get_rallies_data(self):
        """Gets the rallies json file"""
        if not self.rallies_file:            
            return {}      
        if not os.path.exists(self.rallies_file):
            raise FileNotFoundError()  
        with open(self.rallies_file) as f:
            return json.load(f)
        
    def get_categories(self):
        """Gets the categories as a list from annotations file"""
        if not self.annotations_file:
            return []
        if not os.path.exists(self.annotations_file):
            return []
        with open(self.annotations_file, 'r') as f:
            annotations = json.load(f)
            if "categories" in annotations:
                return annotations["categories"]
        return []
    
    def get_poses(self):
        if not os.path.exists(self.pose_coordinates_file):
            return None
        with open(self.pose_coordinates_file, 'r') as f:
            return json.load(f)
        return None          

    def get_player_from_hitting_moment(self, hitting_moment):
        """Extract player info from hitting moment data and poses"""
        if "playerId" in hitting_moment:
            return f"p{hitting_moment['playerId']}"
        
        if "boundingBoxes" in hitting_moment and hitting_moment["boundingBoxes"]:
            boxes = hitting_moment["boundingBoxes"]
            if boxes and len(boxes) > 0:
                largest_box = max(boxes, key=lambda box: box.get("bbox")[2] * box.get("bbox")[3] 
                                if "bbox" in box and len(box["bbox"]) >= 4 else 0)
                if "category_id" in largest_box:
                    return f"p{largest_box['category_id']}"
        return f"p{random.randint(1, 4)}"
        
    def get_player_handedness(self, player_id, categories):
        """Get handedness for a player from category data"""
        if not categories:
            return "unknown"
        
        if isinstance(player_id, str) and player_id.startswith('p'):
            player_id = int(player_id[1:])
        else:
            player_id = int(player_id)
        
        for category in categories:
            if category.get('id') == player_id:
                return category.get('handedness', 'unknown')        
        return "unknown"
    
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
        
        # Get player position
        player_position = moment.get("playerPosition", None)
        if not player_position:
            print("No player position found")
            return None, None, None
            
        # Try different frame key formats
        frame_key = None
        possible_keys = [
            f"{frame_number}",           # Plain number: "1"
            f"{frame_number:04d}",       # Zero-padded to 4 digits: "0001"
            f"{frame_number:06d}",       # Zero-padded to 6 digits: "000001"
            f"frame_{frame_number}",     # With frame_ prefix: "frame_1"
            f"frame_{frame_number:04d}", # With frame_ prefix and zero-padding: "frame_0001"
        ]
        
        frame_data = []
        for key in possible_keys:
            if key in bbox_data:
                frame_key = key
                frame_data = bbox_data[key]
                print(f"Found matching frame key: {frame_key} with {len(frame_data)} bboxes")
                break
        
        if not frame_key:
            # Last resort: try to find a matching key by numeric value
            for key in bbox_data.keys():
                try:
                    # Remove any non-numeric prefix like "frame_"
                    clean_key = key.split("_")[-1] if "_" in key else key
                    if int(clean_key) == frame_number:
                        frame_key = key
                        frame_data = bbox_data[key]
                        print(f"Found numeric matching frame key: {frame_key}")
                        break
                except ValueError:
                    continue
        
        if not frame_key:
            print(f"No matching frame key found for frame {frame_number}")
            print(f"Available keys (first 10): {list(bbox_data.keys())[:10]}")
            return None, None, None
            
        # Get bounding boxes for current frame
        bboxes = self._get_bboxes_from_data(frame_data)
        
        if not bboxes or len(bboxes) == 0:
            print(f"No valid bounding boxes found for frame {frame_key}")
            return None, None, None
            
        # Find hitting player and partner
        hitting_player, hitting_partner = self._find_hitting_players(bboxes, player_position)
        
        if hitting_player == -1:
            print("No hitting player found")
            return None, None, None
        
        print(f"Found hitting player at index {hitting_player} and partner at {hitting_partner}")
            
        # Process player in next frame (for n frames later)
        player_n_path = None
        n_frames = 10  # Default frames ahead to look
        
        if next_moment:
            next_frame_number = next_moment.get("frameNumber", frame_number + n_frames)
            
            # Try different formats for next frame too
            next_frame_key = None
            next_frame_data = []
            
            for key_format in possible_keys:
                next_key = key_format.replace(str(frame_number), str(next_frame_number))
                if next_key in bbox_data:
                    next_frame_key = next_key
                    next_frame_data = bbox_data[next_key]
                    print(f"Found next frame key: {next_frame_key} for current frame {frame_key}")
                    break
            
            if not next_frame_key:
                # Try numeric matching for next frame
                for key in bbox_data.keys():
                    try:
                        clean_key = key.split("_")[-1] if "_" in key else key
                        if int(clean_key) == next_frame_number:
                            next_frame_key = key
                            next_frame_data = bbox_data[key]
                            print(f"Found numeric matching next frame key: {next_frame_key}")
                            break
                    except ValueError:
                        continue
            
            if next_frame_key:
                next_bboxes = self._get_bboxes_from_data(next_frame_data)
                
                if next_bboxes and len(next_bboxes) > 0:
                    next_player_position = next_moment.get("playerPosition", player_position)
                    hitting_player_n = self._find_hitting_player(next_bboxes, next_player_position)
                    
                    if hitting_player_n != -1:
                        player_n_path = self._extract_player(
                            video_id, 
                            next_frame_number, 
                            next_bboxes[hitting_player_n], 
                            "hitting_player_n"
                        )
                        print(f"Extracted player_n image: {player_n_path}")
        
        # Extract player images
        player_path = self._extract_player(
            video_id, 
            frame_number, 
            bboxes[hitting_player], 
            "hitting_player"
        )
        print(f"Extracted player image: {player_path}")
        
        # Extract partner image if found
        partner_path = None
        if hitting_partner != -1:
            partner_path = self._extract_player(
                video_id, 
                frame_number, 
                bboxes[hitting_partner], 
                "hitting_partner"
            )
            print(f"Extracted partner image: {partner_path}")
        
        return player_path, partner_path, player_n_path
    
    def _get_bboxes_from_data(self, frame_data):
        """Extract normalized bounding boxes from frame data"""
        if not frame_data:
            return []
            
        all_bboxes = []
        for item in frame_data:
            if 'bbox' in item:
                bbox = item['bbox']
                
                # Print bbox to debug
                print(f"Processing bbox: {bbox} from item: {item}")
                
                # Handle different bbox formats
                if isinstance(bbox, list) and len(bbox) == 4:
                    if isinstance(bbox[2], int) and bbox[2] > bbox[0]:  
                        # Already [x1,y1,x2,y2] format
                        all_bboxes.append(bbox)
                        print(f"Using bbox directly: {bbox}")
                    else:  
                        # [x,y,width,height] format - convert to [x1,y1,x2,y2]
                        x_min, y_min, width, height = bbox
                        all_bboxes.append([x_min, y_min, x_min + width, y_min + height])
                        print(f"Converted bbox to [x1,y1,x2,y2]: {[x_min, y_min, x_min + width, y_min + height]}")
                else:
                    print(f"Invalid bbox format: {bbox}")
        
        print(f"Extracted {len(all_bboxes)} valid bounding boxes")
        return all_bboxes
    
    def _find_hitting_players(self, bboxes, player_position):
        """Find the hitting player and their partner based on positions"""
        if len(bboxes) == 0:
            return -1, -1
        
        # Convert player_position to x,y coordinates
        if isinstance(player_position, dict):
            position_x, position_y = player_position.get('x', 0), player_position.get('y', 0)
        else:
            position_x, position_y = player_position[0], player_position[1]
        
        # Calculate centers of all bounding boxes
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
            distance = ((center[0] - position_x) ** 2 + (center[1] - position_y) ** 2) ** 0.5
            if distance < min_distance:
                min_distance = distance
                hitting_player_idx = i
        
        # Find partner (second closest player)
        hitting_partner_idx = -1
        if hitting_player_idx != -1:
            min_partner_distance = float('inf')
            
            for i, center in enumerate(bbox_centers):
                if i != hitting_player_idx:
                    # Find closest player on width axis
                    distance = abs(center[0] - bbox_centers[hitting_player_idx][0])
                    if distance < min_partner_distance:
                        min_partner_distance = distance
                        hitting_partner_idx = i
        
        return hitting_player_idx, hitting_partner_idx
    
    def _find_hitting_player(self, bboxes, player_position):
        """Find the index of the closest player to the given position"""
        if len(bboxes) == 0:
            return -1
        
        # Convert player_position to x,y coordinates
        if isinstance(player_position, dict):
            position_x, position_y = player_position.get('x', 0), player_position.get('y', 0)
        else:
            position_x, position_y = player_position[0], player_position[1]
        
        # Calculate centers of all bounding boxes
        bbox_centers = []
        for bbox in bboxes:
            x_min, y_min, x_max, y_max = bbox
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            bbox_centers.append([center_x, center_y])
        
        # Find closest player
        min_distance = float('inf')
        closest_idx = -1
        
        for i, center in enumerate(bbox_centers):
            distance = ((center[0] - position_x) ** 2 + (center[1] - position_y) ** 2) ** 0.5
            if distance < min_distance:
                min_distance = distance
                closest_idx = i
        
        return closest_idx
    
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
            
        except Exception:
            return None
    
    def _generate_random_player_descriptions(self):
        """Generate random player descriptions"""
        colors = ["red", "blue", "black", "white", "green", "yellow", "purple", "orange", "gray"]
        items = ["shirt", "shorts", "shoes", "hat", "wristband"]
        handedness_options = ["right", "left", "unknown"]
        
        descriptions = {}
        handedness_info = {}
        
        for i in range(1, 5):  # Generate for p1, p2, p3, p4
            color1 = random.choice(colors)
            color2 = random.choice(colors)
            while color2 == color1:
                color2 = random.choice(colors)
                
            item1 = random.choice(items)
            item2 = random.choice(items)
            while item2 == item1:
                item2 = random.choice(items)
                
            descriptions[f"p{i}"] = f"{color1} {item1} {color2} {item2}"
            handedness_info[f"p{i}"] = random.choice(handedness_options)
        
        return {
            "descriptions": descriptions,
            "handedness": handedness_info
        }
       
    def extract_player_descriptions(self):        
        try:                         
            if os.path.exists(self.annotations_file):
                with open(self.annotations_file, 'r') as f:
                    annotations = json.load(f)
                    
                # Get player descriptions from categories
                if "categories" in annotations and len(annotations["categories"]) > 0:
                    descriptions = {}
                    handedness_info = {}
                    
                    for category in annotations["categories"]:
                        player_id = f"p{category['id']}"
                        name = category['name']
                        handedness = category.get('handedness', 'unknown')
                        
                        descriptions[player_id] = name
                        handedness_info[player_id] = handedness
                    
                    # Add handedness info to output
                    return {
                        "descriptions": descriptions,
                        "handedness": handedness_info                    
                    }
        except Exception:
            pass
        return self._generate_random_player_descriptions()              

    def generate_shot_labels(self, hitting_moments, rallies_data, pose_data, categories, player_descriptions):
        """Generate a shot"""
        pass

    def generate_labels(self, video_id):
        """Generate shot labels for tennis rallies"""
        # Construct paths for source data
        self.set_video(video_id)
            
        # Load rally data
        try:
            rallies_data = self.get_rallies_data()
            rallies_data['video_id'] = video_id
        except FileNotFoundError:
            return jsonify({"error": "No rallies found for this video"}), 404
        except json.JSONDecodeError:
            return jsonify({"error": f"Invalid JSON in rally file"}), 500
        except Exception as e:
            return jsonify({"error": f"Error reading rally file: {str(e)}"}), 500
        
        # Load player categories to get handedness info    
        try:
            categories = self.get_categories()
        except Exception:
            categories = []
        
        # Load pose data if available    
        try:
            pose_data = self.get_poses()
        except Exception:
            pose_data = None
        
        # Get player descriptions
        player_descriptions = self.extract_player_descriptions()
        
        # Process each rally to generate labels
        predicted_rallies = []
        
        # Get all rallies from the loaded data
        for rally_id, rally_info in rallies_data.get("rallies", {}).items():
            # Skip if rally info is invalid
            if not isinstance(rally_info, dict):
                continue
                
            # Get hitting moments for this rally
            hitting_moments = rally_info.get("hittingMoments", [])
            if not hitting_moments:
                continue
            
            # Sort hitting moments by frame number
            hitting_moments = sorted(hitting_moments, key=lambda x: x.get("frameNumber", 0))
            
            # Generate shot labels for one rally based on model-specific generator function
            events = self.generate_shot_labels(hitting_moments, rallies_data, pose_data, categories, player_descriptions)
            predicted_rallies.append(events)
    
        # Prepare the final output
        output = {
            "video_id": video_id,
            "rallies": predicted_rallies
        }
        
        # Save to file
        try:
            with open(self.output_file, 'w') as output_file:
                json.dump(output, output_file, indent=2)
        except Exception:
            pass
        
        return jsonify({"message": "Shot labels successfully generated", "rallies": output}), 200