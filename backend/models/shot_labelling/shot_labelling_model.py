import json
import os
import random
import PIL
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
        player_left_of_net = player_position.get('x', 0) < net_position.get('x', 0)

        if is_near:
            return "near_ad" if player_left_of_net else "near_deuce"
        else:
            return "far_deuce" if player_left_of_net else "far_ad"

    @staticmethod
    def get_shot_direction(handedness, side, start, end):
        if ("near" in start and "near" in end) or ("far" in start and "far" in end):
            print('Start and end positions cannot be on the same side. Ignoring...')
            # raise Exception('Start and end positions cannot be on the same side')
        start_court_pos = "ad" if "ad" in start else "deuce"
        end_court_pos = "ad" if "ad" in end else "deuce"
        return POSSIBLE_SHOT_DIRECTIONS[handedness][side][f'{start_court_pos}_{end_court_pos}']

    def __init__(self, id="random", rallies_path="rallies",
            output_path="generated_labels", pose_coordinates_path="pose_coordinates",
            pose_frames_path="pose_frames", annotations_path="annotations",
            raw_frames_path="raw_frames", bbox_path="bbox"):
        self.id = id
        self.rallies_path = os.path.join(DATA_DIR, rallies_path)
        self.output_path = os.path.join(DATA_DIR, output_path)
        self.pose_coordinates_path = os.path.join(DATA_DIR, pose_coordinates_path)
        self.pose_frames_dir = os.path.join(DATA_DIR, pose_frames_path)
        self.annotations_path = os.path.join(DATA_DIR, annotations_path)
        self.raw_frames_dir = os.path.join(DATA_DIR, raw_frames_path)
        self.bbox_dir = os.path.join(DATA_DIR, bbox_path)
        self.shot_generator_function = None

        # Default image size for scaling calculations
        self.width = 1280
        self.height = 720

        os.makedirs(self.output_path, exist_ok=True)

    def set_video(self, video_id):
        """Sets the video specific file paths"""
        self.video_id = video_id
        self.annotations_file = os.path.join(self.annotations_path, f"{video_id}_coco_annotations.json")
        self.rallies_file = os.path.join(self.rallies_path, f'{video_id}_rallies.json')
        self.pose_coordinates_file = os.path.join(self.pose_coordinates_path, f'{video_id}_pose.json')
        self.pose_frames_dir = os.path.join(self.pose_frames_dir, video_id)
        self.output_file = os.path.join(self.output_path, f'{video_id}_labelled.json')
        self.bbox_file = os.path.join(self.bbox_dir, f"{video_id}_boxes.json")

    def get_images_from_frame_numbers(self, start_frame, end_frame, step_size=1):
        """Fetches images from the video frame numbers with customizable step size"""
        images = []
        frame_numbers = range(start_frame, end_frame + 1, step_size)
        for frame_number in frame_numbers:
            image = self.get_image_from_frame_number(frame_number)
            if image:
                images.append(image)
        return images

    def get_image_from_frame_number(self, frame_number):
        """Fetches image from the video frame number"""
        frame_name = "%04d_pred.jpg" % frame_number
        full_frame_path = os.path.join(self.pose_frames_dir, frame_name)
        if not os.path.exists(full_frame_path):
            return None
        return PIL.Image.open(full_frame_path)

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

    def _find_hitting_players_by_id(self, bboxes_data, player_id, categories=None):
        """Find hitting player and partner based on player ID

        Args:
            bboxes_data: List of bounding box data including label
            player_id: Player ID (as integer, not p1 format)
            categories: List of categories with ID to label mapping

        Returns:
            tuple: (hitting_player_index, partner_index)
        """
        hitting_player_idx = -1
        partner_id = -1
        partner_idx = -1

        # Determine partner ID based on team structure
        if player_id == 1:
            partner_id = 2
        elif player_id == 2:
            partner_id = 1
        elif player_id == 3:
            partner_id = 4
        elif player_id == 4:
            partner_id = 3

        # First attempt: Try to find player and partner by their labels in categories
        if categories:
            player_label = None
            partner_label = None

            # Find the labels for both player and partner
            for category in categories:
                if category.get('id') == player_id:
                    player_label = category.get('name')
                elif category.get('id') == partner_id:
                    partner_label = category.get('name')

            # If we found the labels, search for them in the bboxes
            if player_label or partner_label:
                for i, box_data in enumerate(bboxes_data):
                    if "label" in box_data:
                        if player_label and box_data["label"] == player_label:
                            hitting_player_idx = i
                        elif partner_label and box_data["label"] == partner_label:
                            partner_idx = i

        # Second attempt: Try to infer by common label patterns if not found
        if hitting_player_idx == -1 or partner_idx == -1:
            common_labels = {
                1: ["red", "player 1", "p1"],
                2: ["black", "player 2", "p2"],
                3: ["white", "player 3", "p3"],
                4: ["pink", "player 4", "p4"]
            }

            player_keywords = common_labels.get(player_id, [])
            partner_keywords = common_labels.get(partner_id, [])

            for i, box_data in enumerate(bboxes_data):
                if "label" in box_data:
                    label = box_data["label"].lower()

                    # Check for player
                    if hitting_player_idx == -1:
                        if any(keyword in label for keyword in player_keywords):
                            hitting_player_idx = i

                    # Check for partner
                    if partner_idx == -1:
                        if any(keyword in label for keyword in partner_keywords):
                            partner_idx = i

        return hitting_player_idx, partner_idx

    def _find_frame_key(self, bbox_data, frame_number):
        """Find the correct key for a frame in the bbox data"""
        possible_keys = [
            f"{frame_number}",           # Plain number: "1"
            f"{frame_number:04d}",       # Zero-padded to 4 digits: "0001"
            f"{frame_number:06d}",       # Zero-padded to 6 digits: "000001"
            f"frame_{frame_number}",     # With frame_ prefix: "frame_1"
            f"frame_{frame_number:04d}", # With frame_ prefix and zero-padding: "frame_0001"
            f"frame_{frame_number:06d}", # With frame_ prefix and zero-padding: "frame_000001"
        ]

        for key in possible_keys:
            if key in bbox_data:
                return key

        # Last resort: try to find a matching key by numeric value
        for key in bbox_data.keys():
            try:
                # Remove any non-numeric prefix like "frame_"
                clean_key = key.split("_")[-1] if "_" in key else key
                if int(clean_key) == frame_number:
                    return key
            except ValueError:
                continue

        return None

    def _get_bbox_from_data(self, box_data):
        """Extract normalized bounding box from a single box data entry"""
        if not box_data or "bbox" not in box_data:
            return None

        bbox = box_data["bbox"]

        # Handle different bbox formats
        if isinstance(bbox, list) and len(bbox) == 4:
            # Check if format is [x, y, width, height] by examining the values
            # In [x,y,w,h] format, w and h are typically smaller than x and y
            x1, y1, x2_or_w, y2_or_h = bbox

            # If x2 is significantly smaller than x1, assume it's a width
            if isinstance(x2_or_w, (int, float)) and isinstance(y2_or_h, (int, float)):
                if x2_or_w < x1 or y2_or_h < y1:
                    # It's likely [x,y,w,h] format
                    return [x1, y1, x1 + x2_or_w, y1 + y2_or_h]
                else:
                    # If the third and fourth values are larger, assume it's [x1,y1,x2,y2]
                    # This would be the case for pre-processed bounding boxes
                    return bbox

            # Default handling based on comparison between coordinates
            if isinstance(x2_or_w, int) and x2_or_w > x1:
                # Probably [x1,y1,x2,y2] format
                return bbox
            else:
                # Probably [x,y,width,height] format
                return [x1, y1, x1 + x2_or_w, y1 + y2_or_h]

        return None

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

        # Get net position
        self.net_position = rallies_data.get("netPosition", None)

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
            events = self.generate_shot_labels(hitting_moments, rally_info, pose_data, categories, player_descriptions)
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