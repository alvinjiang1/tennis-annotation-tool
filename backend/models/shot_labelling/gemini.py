from flask import jsonify
from google.genai import Client
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
        self.GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
        # self.model = Client(api_key=self.GEMINI_API_KEY)
        
    def generate_shot_labels(self, hitting_moments, rallies_data, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        
        # Get net position from rally data if available
        net_position = rallies_data.get("netPosition", None)
        
        # Generate events for each hitting moment
        events = []            
        n = len(hitting_moments)        
        for i, moment in enumerate(hitting_moments):
            next_moment = None
            if i < n - 1:
                next_moment = hitting_moments[i+1]                        
                                    
            is_serve = True if i == 0 else False
            is_return = True if i == 1 else False
            is_last = True if i == n - 1 else False
            # Generate shot label based on available data
            shot_info = generate_from_two_hms(moment, next_moment, net_position, is_serve, is_return, is_last)
            
            # Add event with all available data
            event = {
                "player": shot_info['player'],
                "frame": shot_info['frame_number'],
                "label": shot_info["label"],
                "outcome": shot_info["outcome"],
                "handedness": shot_info['handedness']  # Include handedness in output for reference
            }                        
            player_position = moment.get("playerPosition", None)
            if player_position:
                event['player_position'] = player_position
            events.append(event)
        
            
        # Create rally output
        rally_labels = {
            "player_descriptons": player_descriptions,
            "events": events
        }
        
        if net_position:
            rally_labels["net_position"] = net_position

        return rally_labels
    
    def generate_serve_label(moment, next_moment):
        return
    def generate_stroke_label(moment, next_moment):
        return
    def generate_outcome(moment, outcome):
        """
        Looks at the hitting moment and the ending frame to decide if the outcome
        was due to a winner or an error.
        """

    def generate_from_two_hms(self, moment, next_moment, net_position, is_serve, is_return, is_last):
        """Generate a shot label based on position in rally and available info"""

        frame_number = moment.get("frameNumber", 0)
        player_position = moment.get("playerPosition", None)    
        
        # Determine player
        player = self.get_player_from_hitting_moment(moment)
        
        # Court position - either determined from actual positions or random
        court_position = ShotLabellingModel.get_court_position(net_position, player_position)

        # Determine shot outcome
        outcome = "in"
        if is_last:
            outcome = generate_outcome(moment, next_moment)

        # Determine formation
        formation = "non-serve"
        if is_serve:
            formation = generate_formation(moment)
        
        # Determine shot type
        shot_type = ""
        if is_serve:
            shot_type="serve"
        if is_return:
            shot_type="return"
        if is_last:
            shot_type="swing" # Temporarily put as swing, since last frame info not avail
        else:
            shot_type = generate_shot_type(moment, next_moment)

        # Determine side
        side = generate_side(moment)
        # Determine shot direction    
        direction="DL" # Temporarily put DL, since last frame info not avail    
        if not is_last:
            next_player_position = next_moment.get("playerPosition", None)
            handedness = self.get_player_handedness(player, self.get_categories())
            next_court_position = ShotLabellingModel.get_court_position(net_position, next_player_position)            
            direction = ShotLabellingModel.get_shot_direction(handedness, side, court_position, next_court_position)
            
        
        # Create label following the format
        label = f"{court_position}_{side}_{shot_type}_{direction}_{formation}_{outcome}"
        # Court position -> code
        # direction -> code
        # formation -> generated (diff if serve)
        # outcome -> generated (diff if end)
        # shot_type -> generated (diff if serve and return)
        # side -> generated
        # Add additional data if available (position, bbox, etc.)
        return {
            "player": player,
            "frame_number": frame_number,
            "label": label,
            "outcome": outcome,
            "handedness": handedness
        }