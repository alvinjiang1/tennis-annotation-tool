import json
import os
import random

from flask import jsonify

DATA_DIR = "data"

class ShotLabellingModel:    
    
    @staticmethod
    def get_court_position(net_position, player_position):
        """Determine court position based on player's position relative to net"""        
        if not net_position or not player_position:
            print("Net position or player position not provided.\
                  Using random court position")
            return random.choice(["near_deuce", "near_ad", "far_deuce", "far_ad"])
        is_near = player_position.get('y', 0) > net_position.get('y', 0)
        is_deuce = player_position.get('x', 0) < net_position.get('x', 0)
        
        if is_near:
            return "near_deuce" if is_deuce else "near_ad"
        else:
            return "far_deuce" if is_deuce else "far_ad"            

    def __init__(self, id="random", rallies_path="rallies",
            output_path="generated_labels", pose_coordinates_path="pose_coordinates", 
            annotations_path="annotations"):
        self.id = id
        self.rallies_path = os.path.join(DATA_DIR, rallies_path)
        self.output_path = os.path.join(DATA_DIR, output_path)
        self.pose_coordinates_path = os.path.join(DATA_DIR, pose_coordinates_path)
        self.annotations_path = os.path.join(DATA_DIR, annotations_path)
        self.shot_generator_function = None

        os.makedirs(self.output_path, exist_ok=True)

    def set_video(self, video_id):
        """Sets the video specific file paths"""
        self.annotations_file = os.path.join(self.annotations_path, f"{video_id}_coco_annotations.json")
        self.rallies_file = os.path.join(self.rallies_path, f'{video_id}_rallies.json')
        self.pose_coordinates_file = os.path.join(self.pose_coordinates_path, f'{video_id}_pose.json')
        self.output_file = os.path.join(self.output_path, f'{video_id}_labelled.json')

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
        raise Exception
    
    def get_poses(self):
        if not os.path.exists(self.pose_coordinates_file):
            return None
        with open(self.pose_coordinates_file, 'r') as f:
            return json.load(f)
        raise Exception          

    def get_player_from_hitting_moment(self, hitting_moment):
        """Extract player info from hitting moment data and poses"""
        # If player is explicitly specified in hitting moment, use that
        if "playerId" in hitting_moment:
            return f"p{hitting_moment['playerId']}"
        
        # If we have bounding boxes in the hitting moment, use the largest one
        if "boundingBoxes" in hitting_moment and hitting_moment["boundingBoxes"]:
            boxes = hitting_moment["boundingBoxes"]
            if boxes and len(boxes) > 0:
                # Find the box with the largest area
                largest_box = max(boxes, key=lambda box: box.get("bbox")[2] * box.get("bbox")[3] 
                                if "bbox" in box and len(box["bbox"]) >= 4 else 0)
                if "category_id" in largest_box:
                    return f"p{largest_box['category_id']}"
        print("Unable to extract player from hitting moment. Using randomly "
            "generated player instead")
        return f"p{random.randint(1, 4)}"
        
    def get_player_handedness(self, player_id, categories):
        """Get handedness for a player from category data"""
        if not categories:
            return "unknown"
        
        # Strip the 'p' prefix if present and convert to integer
        if isinstance(player_id, str) and player_id.startswith('p'):
            player_id = int(player_id[1:])
        else:
            player_id = int(player_id)
        
        # Find the player in categories
        for category in categories:
            if category.get('id') == player_id:
                return category.get('handedness', 'unknown')
        
        return "unknown"  
    
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
        except Exception as e:
            print(f"Error extracting player descriptions: {e}")
        print("Using randomly generated player descriptions instead")
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
        except FileNotFoundError as e:
            return jsonify({"error": "No rallies found for this video"}), 404
        except json.JSONDecodeError as e:
            return jsonify({"error": f"Invalid JSON in rally file: {str(e)}"}), 500
        except Exception as e:
            return jsonify({"error": f"Error reading rally file: {str(e)}"}), 500
        
        # Load player categories to get handedness info    
        try:
            categories = self.get_categories()
        except Exception as e:
            print(f"Error loading player categories: {e}")
        
        # Load pose data if available    
        try:
            pose_data = self.get_poses()
        except Exception as e:
            print(f"Error loading pose data: {e}")                
        
        # Get player descriptions
        player_descriptions = self.extract_player_descriptions()
        
        # Process each rally to generate labels
        predicted_rallies = []
        
        # Get all rallies from the loaded data
        for rally_id, rally_info in rallies_data.get("rallies", {}).items():
            # Skip if rally info is invalid
            if not isinstance(rally_info, dict):
                print(f"Skipping rally {rally_id} - invalid format")
                continue
                
            print(f"Processing rally {rally_id}")
            
            # Get hitting moments for this rally
            hitting_moments = rally_info.get("hittingMoments", [])
            if not hitting_moments:
                print(f"No hitting moments found for rally {rally_id}")
                continue
            
            # Sort hitting moments by frame number
            hitting_moments = sorted(hitting_moments, key=lambda x: x.get("frameNumber", 0))
            
            # Generate shot labels for one rally based on model-specific generator function
            events = self.generate_shot_labels(hitting_moments, rallies_data, pose_data, categories, player_descriptions)
            predicted_rallies.append(events)
            print(f"Generated {len(events)} labels for rally {rally_id}")
    
        # Prepare the final output
        output = {
            "video_id": video_id,
            "rallies": predicted_rallies
        }
        
        # Save to file
        try:
            with open(self.output_file, 'w') as output_file:
                json.dump(output, output_file, indent=2)
            print(f"Saved generated labels to {self.output_file}")
        except Exception as e:
            print(f"Error saving output file: {e}")
        
        return jsonify({"message": "Shot labels successfully generated", "rallies": output}), 200
    