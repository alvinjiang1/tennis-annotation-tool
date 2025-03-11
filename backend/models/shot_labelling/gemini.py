from flask import jsonify
import json
import os
import random

from models.shot_labelling.shot_labelling_model import ShotLabellingModel

class GeminiModel(ShotLabellingModel):
    def __init__(self):
        super().__init__(id="gemini", rallies_path="rallies",
            output_path="generated_labels", pose_coordinates_path="pose_coordinates", 
            annotations_path="annotations")
        self.name = "Gemini (MLLM)"
        self.description = "Gemini 2.0-Flash (MLLM Generator) to generate labels based on multimodal input"
        
    def generate_shot_labels(self, hitting_moments, rallies_data, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        
        # Get net position from rally data if available
        net_position = rallies_data.get("netPosition", None)
        
        # Generate events for each hitting moment
        events = []            
        for i, moment in enumerate(hitting_moments):
            frame_number = moment.get("frameNumber", 0)
            
            # Get the player from the hitting moment data
            player_id = self.get_player_from_hitting_moment(moment)
            
            # Get player handedness from the categories
            handedness = self.get_player_handedness(player_id, categories)
            
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

        return rally_labels
    
def generate_random_shot_label(frame_index, hit_type=None, net_position=None, player_position=None, handedness="unknown"):
    """Generate a shot label based on position in rally and available info"""
    # Court position - either determined from actual positions or random
    court_position = ShotLabellingModel.get_court_position(net_position, player_position)
    
    # Shot type based on position in rally
    if hit_type is None:
        if frame_index == 0:
            shot_type = "serve"  # First shot is always a serve
        elif frame_index == 1:
            shot_type = "return"  # Second shot is always a return
        else:
            # More variety in shot types for non-serve/return shots
            shot_type = random.choice(["volley", "lob", "smash", "swing"])
    else:
        shot_type = hit_type
    
    # Is this a serve?
    is_serve = shot_type == "serve" or shot_type == "second-serve"
    
    # Side (forehand/backhand)
    # For left-handed players, adjust the forehand/backhand probability based on court position
    if handedness == "left":
        # Left-handed players are more likely to hit forehand on deuce court, backhand on ad court
        if "deuce" in court_position:
            side = random.choices(["forehand", "backhand"], weights=[0.7, 0.3])[0]
        else:  # ad court
            side = random.choices(["forehand", "backhand"], weights=[0.3, 0.7])[0]
    elif handedness == "right":
        # Right-handed players are more likely to hit forehand on ad court, backhand on deuce court
        if "deuce" in court_position:
            side = random.choices(["forehand", "backhand"], weights=[0.3, 0.7])[0]
        else:  # ad court
            side = random.choices(["forehand", "backhand"], weights=[0.7, 0.3])[0]
    else:
        # Unknown handedness - equal chance
        side = random.choice(["forehand", "backhand"])
    
    # Direction varies based on shot type and handedness
    if is_serve:
        # For serves, direction can only be T, B, or W
        direction = random.choice(["T", "B", "W"])
        # Formation for serves only
        formation = random.choice(["conventional", "i-formation", "australian"])
    else:
        # For non-serves, formation is non-serve
        formation = "non-serve"
        
        # Direction based on court-side-handedness combination
        court_side = court_position.split("_")[1]  # ad or deuce
        
        # Apply the validation rules for direction based on court-side-handedness
        if handedness == "right":
            # Right-handed validations
            if court_side == "ad" and side == "backhand":
                direction = random.choice(["CC", "DL"])
            elif court_side == "ad" and side == "forehand":
                direction = random.choice(["II", "IO"])
            elif court_side == "deuce" and side == "forehand":
                direction = random.choice(["CC", "DL"])
            elif court_side == "deuce" and side == "backhand":
                direction = random.choice(["II", "IO"])
            else:
                direction = random.choice(["CC", "DL", "IO", "II"])
        elif handedness == "left":
            # Left-handed validations
            if court_side == "ad" and side == "forehand":
                direction = random.choice(["CC", "DL"])
            elif court_side == "ad" and side == "backhand":
                direction = random.choice(["II", "IO"])
            elif court_side == "deuce" and side == "backhand":
                direction = random.choice(["CC", "DL"])
            elif court_side == "deuce" and side == "forehand":
                direction = random.choice(["II", "IO"])
            else:
                direction = random.choice(["CC", "DL", "IO", "II"])
        else:
            # Unknown handedness - just pick a random direction
            direction = random.choice(["CC", "DL", "IO", "II"])
    
    # Outcome
    # Last shot in rally more likely to be an error or winner
    if random.random() < 0.7:  # 70% chance of 'in' for non-last shots
        outcome = "in"
    else:
        outcome = random.choice(["err", "win"])
    
    # Create label following the format
    label = f"{court_position}_{side}_{shot_type}_{direction}_{formation}_{outcome}"
    
    return {
        "label": label,
        "outcome": outcome
    }