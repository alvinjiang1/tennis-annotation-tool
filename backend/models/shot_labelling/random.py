from flask import jsonify
import json
import os
import random

# Directory structure
DATA_DIR = "data"
RALLIES_PATH = os.path.join(DATA_DIR, "rallies")
OUTPUT_PATH = os.path.join(DATA_DIR, "generated_labels")
POSE_COORDINATES = os.path.join(DATA_DIR, "pose_coordinates")
ANNOTATIONS_DIR = os.path.join(DATA_DIR, "annotations")

# Ensure output directory exists
os.makedirs(OUTPUT_PATH, exist_ok=True)

def get_random_court_position(net_position, player_position):
    """Determine court position based on player's position relative to net"""
    # If we have actual positions, use them to determine court position
    if net_position and player_position:
        is_near = player_position.get('y', 0) > net_position.get('y', 0)
        is_deuce = player_position.get('x', 0) < net_position.get('x', 0)
        
        if is_near:
            return "near_deuce" if is_deuce else "near_ad"
        else:
            return "far_deuce" if is_deuce else "far_ad"
    
    # Otherwise return random position
    return random.choice(["near_deuce", "near_ad", "far_deuce", "far_ad"])

def generate_random_shot_label(frame_index, hit_type=None, net_position=None, player_position=None, handedness="unknown"):
    """Generate a shot label based on position in rally and available info"""
    # Court position - either determined from actual positions or random
    court_position = get_random_court_position(net_position, player_position)
    
    # Shot type based on position in rally
    if hit_type is None:
        if frame_index == 0:
            shot_type = "serve"  # First shot is always a serve
        elif frame_index == 1:
            shot_type = "return"  # Second shot is always a return
        else:
            shot_type = "stroke"  # All others are regular strokes
    else:
        shot_type = hit_type
    
    # Shot technique - forehand/backhand
    # For left-handed players, adjust the forehand/backhand probability based on court position
    if handedness == "left":
        # Left-handed players are more likely to hit backhand on ad court, forehand on deuce court
        if "deuce" in court_position:
            technique = random.choices(["fh", "bh", "-"], weights=[0.7, 0.3, 0.0])[0]
        else:  # ad court
            technique = random.choices(["fh", "bh", "-"], weights=[0.3, 0.7, 0.0])[0]
    elif handedness == "right":
        # Right-handed players are more likely to hit forehand on ad court, backhand on deuce court
        if "deuce" in court_position:
            technique = random.choices(["fh", "bh", "-"], weights=[0.3, 0.7, 0.0])[0]
        else:  # ad court
            technique = random.choices(["fh", "bh", "-"], weights=[0.7, 0.3, 0.0])[0]
    else:
        # Unknown handedness - equal chance
        technique = random.choice(["fh", "bh", "-"])
    
    # Shot style depends on technique
    if technique == "fh" or technique == "bh":
        style = random.choice(["gs", "vs", "s", "-"])
    else:
        style = "-"  # No style for serves without technique
    
    # Direction varies based on shot type and handedness
    if shot_type == "serve":
        direction = random.choice(["CC", "-"])
    else:
        # Shot direction tendencies vary based on handedness and technique
        if handedness == "left" and technique == "fh":
            # Left-handed forehand - more likely to go down the line from ad court
            if "ad" in court_position:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.3, 0.5, 0.1, 0.1])[0]
            else:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.5, 0.3, 0.1, 0.1])[0]
        elif handedness == "left" and technique == "bh":
            # Left-handed backhand - more likely to go down the line from deuce court
            if "deuce" in court_position:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.3, 0.5, 0.1, 0.1])[0]
            else:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.5, 0.3, 0.1, 0.1])[0]
        elif handedness == "right" and technique == "fh":
            # Right-handed forehand - more likely to go down the line from deuce court
            if "deuce" in court_position:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.3, 0.5, 0.1, 0.1])[0]
            else:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.5, 0.3, 0.1, 0.1])[0]
        elif handedness == "right" and technique == "bh":
            # Right-handed backhand - more likely to go down the line from ad court
            if "ad" in court_position:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.3, 0.5, 0.1, 0.1])[0]
            else:
                direction = random.choices(["CC", "DL", "IO", "II"], weights=[0.5, 0.3, 0.1, 0.1])[0]
        else:
            # Unknown handedness - equal chances
            direction = random.choice(["CC", "DL", "IO", "II"])
    
    # Outcome
    # Last shot in rally more likely to be an error or winner
    if random.random() < 0.7:  # 70% chance of 'in' for non-last shots
        outcome = "in"
    else:
        outcome = random.choice(["err", "win"])
    
    # Create label following the format
    label = f"{court_position}_{shot_type}_{technique}_{style}_{direction}_{outcome}"
    
    return {
        "label": label,
        "outcome": outcome
    }

def extract_player_descriptions(video_id):
    """Extract player descriptions from annotation data if available"""
    annotation_file = os.path.join(ANNOTATIONS_DIR, f"{video_id}_coco_annotations.json")
    
    try:
        if os.path.exists(annotation_file):
            with open(annotation_file, 'r') as f:
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
    
    # Fallback to random descriptions if annotations not available
    return generate_random_player_descriptions()

def generate_random_player_descriptions():
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

def get_player_from_hitting_moment(hitting_moment, poses=None):
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
    
    # Fallback to a random player
    return f"p{random.randint(1, 4)}"

def get_player_handedness(player_id, categories):
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

def generate_labels(video_id):
    """Generate shot labels for tennis rallies"""
    # Construct paths for source data
    rallies_path = os.path.join(RALLIES_PATH, f'{video_id}_rallies.json')
    pose_path = os.path.join(POSE_COORDINATES, f'{video_id}_pose.json')
    output_path = os.path.join(OUTPUT_PATH, f"{video_id}_labelled.json")
    
    # Get annotation file for player categories
    annotation_file = os.path.join(ANNOTATIONS_DIR, f"{video_id}_coco_annotations.json")
    
    # Check if required files exist
    if not os.path.exists(rallies_path):
        return jsonify({"error": "No rallies found for this video"}), 404
        
    # Load rally data
    try:
        with open(rallies_path, 'r') as f:
            rallies_data = json.load(f)
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Invalid JSON in rally file: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Error reading rally file: {str(e)}"}), 500
    
    # Load player categories to get handedness info
    categories = []
    try:
        if os.path.exists(annotation_file):
            with open(annotation_file, 'r') as f:
                annotations = json.load(f)
                if "categories" in annotations:
                    categories = annotations["categories"]
    except Exception as e:
        print(f"Error loading player categories: {e}")
    
    # Load pose data if available
    pose_data = None
    try:
        if os.path.exists(pose_path):
            with open(pose_path, 'r') as f:
                pose_data = json.load(f)
    except Exception as e:
        print(f"Error loading pose data: {e}")
    
    # Get net position from rally data if available
    net_position = rallies_data.get("netPosition", None)
    
    # Get player descriptions
    player_descriptions = extract_player_descriptions(video_id)
    
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
        
        # Generate events for each hitting moment
        events = []
        for i, moment in enumerate(hitting_moments):
            frame_number = moment.get("frameNumber", 0)
            
            # Get the player from the hitting moment data
            player_id = get_player_from_hitting_moment(moment, pose_data)
            
            # Get player handedness from the categories
            handedness = get_player_handedness(player_id, categories)
            
            # Determine hit type based on position in rally
            hit_type = None
            if i == 0:
                hit_type = "serve"
            elif i == 1:
                hit_type = "return"
            else:
                hit_type = "stroke"
            
            # Get player position from the hitting moment
            player_position = moment.get("playerPosition", None)
            
            # Generate shot label based on available data
            shot_info = generate_random_shot_label(
                i, 
                hit_type=hit_type,
                net_position=net_position,
                player_position=player_position,
                handedness=handedness
            )
            
            # Set outcome for last shot in rally
            if i == len(hitting_moments) - 1:
                # Last shot is more likely to be an error or winner
                if random.random() < 0.8:  # 80% chance for last shot
                    shot_info["outcome"] = random.choice(["err", "win"])
            
            # Add event with all available data
            event = {
                "player": player_id,
                "frame": frame_number,
                "label": shot_info["label"],
                "outcome": shot_info["outcome"],
                "handedness": handedness  # Include handedness in output for reference
            }
            
            # Add additional data if available (position, bbox, etc.)
            if player_position:
                event["player_position"] = player_position
                
            events.append(event)
        
        # Create rally output
        rally_labels = {
            "player_descriptons": player_descriptions,
            "events": events
        }
        
        if net_position:
            rally_labels["net_position"] = net_position
        
        predicted_rallies.append(rally_labels)
        print(f"Generated {len(events)} labels for rally {rally_id}")
    
    # Prepare the final output
    output = {
        "video_id": video_id,
        "rallies": predicted_rallies
    }
    
    # Save to file
    try:
        with open(output_path, 'w') as output_file:
            json.dump(output, output_file, indent=2)
        print(f"Saved generated labels to {output_path}")
    except Exception as e:
        print(f"Error saving output file: {e}")
    
    return jsonify({"message": "Shot labels successfully generated", "rallies": output}), 200