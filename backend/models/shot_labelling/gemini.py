from flask import jsonify
from google.genai import Client
import json
import os
import random

from models.shot_labelling.shot_labelling_model import ShotLabellingModel

class GeminiModel(ShotLabellingModel):
    def __init__(self):
        super().__init__(id="gemini")
        self.name = "Gemini (MLLM)"
        self.description = "Gemini 2.0-Flash (MLLM Generator) to generate labels based on multimodal input"
        GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')        
        self.client = Client(api_key=GEMINI_API_KEY)
        
    def generate_shot_labels(self, hitting_moments, rally_info, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        
        # Get net position from rally data if available
        net_position = self.net_position
        end_frame = rally_info.get("endFrame", None)
        end_ball_pos = rally_info.get("endBallPosition", None)
        # Generate events for each hitting moment
        events = []            
        n = len(hitting_moments)        
        for i, moment in enumerate(hitting_moments):            
            next_moment = None
            if i < n - 1:
                next_moment = hitting_moments[i+1]  
            else: # Last frame: no next_moment, use end_frame and end_ball_pos instead
                next_moment = (end_frame, end_ball_pos)
                                    
            is_serve = (i==0)
            is_return = (i==1)
            is_last = (i==n-1)
            # Generate shot label based on available data
            shot_info = self.generate_from_two_hms(moment, next_moment, net_position, is_serve, is_return, is_last)

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
        
    def generate_serve_direction(self, moment, next_moment):
        frame_number = moment.get("frameNumber", 0)+1
        next_frame = next_moment.get("frameNumber", 0)+1
        player = moment.get("playerId", None)
        player_position = moment.get("playerPosition", None)
        images = self.get_images_from_frame_numbers(frame_number, next_frame)
        serve_direction_prompt = f"You are provided the images for the current serving moment, as well" \
        "as that of the next hitting moment. In addition, you are provided the" \
        f" player that hit the serve: {player}, as well as his coordinates: {player_position}." \
        "Determine the direction of the serve. " \
        "Output only either 't' for T-serve, 'b' for body serve, 'w' for wide serve."
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[serve_direction_prompt]+images,
        )
        return response.text
        

    def generate_end_direction(self, moment, next_moment, handedness, side):
        frame_number = moment.get("frameNumber", 0)+1      
        end_frame = next_moment[0]
        end_ball_pos = next_moment[1]
        player = moment.get("playerId", None)
        player_position = moment.get("playerPosition", None)
        images = self.get_images_from_frame_numbers(frame_number, end_frame)
        shot_direction_prompt = f"You are provided the images for the current hitting moment, as well " \
        "as that of the shot outcome. In addition, you are provided the " \
        f"player that hit the shot: {player}, as well as his coordinates: {player_position}, you know " \
        f"that they are hitting a {side} shot as a {handedness}-hander. You are also given " \
        f"the ending position of the ball: {end_ball_pos}. " \
        "Determine the direction of the shot. " \
        "Output only either 'ii' for inside-in, 'io' for inside out, 'dl' for down the line, 'cc' for cross-court."        
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[shot_direction_prompt]+images,
        )        
        return response.text
    
    def generate_serve_and_end_direction(self, moment, next_moment):
        frame_number = moment.get("frameNumber", 0)+1      
        end_frame = next_moment[0]
        end_ball_pos = next_moment[1]
        player = moment.get("playerId", None)
        player_position = moment.get("playerPosition", None)
        images = self.get_images_from_frame_numbers(frame_number, end_frame)
        shot_direction_prompt = f"You are provided the images for the current service, as well " \
        "as that of the shot outcome. In addition, you are provided the " \
        f"player that hit the shot: {player}, as well as his coordinates: {player_position}." \
        f"You are also given the ending position of the ball: {end_ball_pos}. " \
        "Determine the direction of the serve. " \
        "Output only either 't' for T-serve, 'b' for body serve, 'w' for wide serve."
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[shot_direction_prompt]+images,
        )        
        return response.text

    def generate_side(self, moment):
        """
        Based on the bounding boxes of the players, determine the side
        """
        player = moment.get("playerId", None)
        frame_number = moment.get("frameNumber")+1
        image = self.get_images_from_frame_numbers(frame_number, frame_number)        
        side_prompt = f"Given the image of the frame, and bounding box information: {moment}," \
        f"determine the whether of the player, {player}, is hitting with forehand or backhand." \
        "Output only either 'forehand' or 'backhand'."
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[side_prompt]+image,
        )
        return response.text
    
    def generate_shot_type(self, moment, next_moment):
        shot_prompt = ""
        images = []
        frame_number = moment.get("frameNumber", 0)+1
        player = moment.get("playerId", None)
        player_position = moment.get("playerPosition", None)
        if type(next_moment) == tuple: # Last shot in rally
            end_frame = next_moment[0]
            end_ball_pos = next_moment[1]
            images = self.get_images_from_frame_numbers(frame_number, end_frame)
            shot_prompt = f"You are provided the images for the final hitting moment, as well" \
            "as that of the shot outcome. In addition, you are provided the " \
            f"player that hit the final shot: {player}, as well as his coordinates {player_position}." \
            f"You also have the final ending coordinates of the tennis ball: {end_ball_pos}. " \
            "Determine the shot type for the tennis shot. Output only either 'swing', 'volley', 'lob', or 'smash'."
        else: # Normal shot
            next_frame = next_moment.get("frameNumber", 0)+1
            next_player = next_moment.get("playerId", None)
            next_player_position = next_moment.get("playerPosition", None)
            images = self.get_images_from_frame_numbers(frame_number, next_frame)
            shot_prompt = f"You are provided the images for the current hitting moment, as well" \
            "as that of the next hitting moment. In addition, you are provided the " \
            f"player that hit the shot: {player}, as well as his coordinates {player_position}." \
            f"You also have the next player that hit the shot: {next_player} and their coordinates: {next_player_position}. " \
            "Determine the shot type for the tennis shot. Output only either 'swing', 'volley', 'lob', or 'smash'."
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[shot_prompt]+images,
        )
        return response.text
        
        
    def generate_formation(self, moment):
        """
        Based on the bounding boxes of the players, determine the formation
        """
        player = moment.get("playerId", None)
        frame_number = moment.get("frameNumber", 0)+1
        image = self.get_images_from_frame_numbers(frame_number, frame_number)
        team_mate = {
            1:2,
            2:1,
            3:4,
            4:3
        }        
        formation_prompt = f"Given the image of the frame, and bounding box information: {moment}," \
        f"determine the formation of the player {player} and his teammate {team_mate[player]}." \
        "Output only either 'i-formation' for I-Formation or 'conventional' for Conventional Formation."
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[formation_prompt]+image,
        )
        return response.text
        
    def generate_outcome(self, moment, end_frame, end_ball_pos):
        """
        Looks at the hitting moment and the ending frame to decide if the outcome
        was due to a winner or an error.
        """
        player = moment.get("playerId", None)
        player_position = moment.get("playerPosition", None)                    
        outcome_prompt = f"You are provided the images for the final hitting moment, as well" \
        "as that of the shot outcome. In addition, you are provided the " \
        f"player that hit the final shot: {player}, as well as his coordinates: {player_position}, and" \
        f"the final ending coordinates of the tennis ball: {end_ball_pos}. " \
        "Determine whether the shot a winner or an error. Output only either 'win' for winner and 'err' for error."
        frame_number = moment.get("frameNumber", 0)+1             
        images = self.get_images_from_frame_numbers(frame_number, end_frame)
        response = self.client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[outcome_prompt]+images,
        )
        
        return response.text

    def generate_from_two_hms(self, moment, next_moment, net_position, is_serve, is_return, is_last):
        """Generate a shot label based on position in rally and available info"""

        frame_number = moment.get("frameNumber", 0)+1
        player_position = moment.get("playerPosition", None)    
        
        # Determine player
        player = self.get_player_from_hitting_moment(moment)
        
        # Court position - either determined from actual positions or random
        court_position = ShotLabellingModel.get_court_position(net_position, player_position)

        # Determine shot outcome
        outcome = "in"
        if is_last:
            end_frame, end_ball_pos = next_moment
            outcome = self.generate_outcome(moment, end_frame, end_ball_pos)

        # Determine formation
        formation = "non-serve"
        if is_serve:
            formation = self.generate_formation(moment)
        
        # Determine shot type
        shot_type = ""
        if is_serve:            
            shot_type="serve"
        if is_return:
            shot_type="return"
        else:
            shot_type = self.generate_shot_type(moment, next_moment)

        # Determine side
        side = self.generate_side(moment)
        handedness = self.get_player_handedness(player, self.get_categories())

        # Determine shot direction    
        direction = None        
        if is_serve and is_last:
            direction = self.generate_serve_and_end_direction(moment, next_moment)
        elif is_serve:            
            direction = self.generate_serve_direction(moment, next_moment)
        elif is_last:
            direction = self.generate_end_direction(moment, next_moment, handedness, side)            
        else:
            next_player_position = next_moment.get("playerPosition", None)            
            next_court_position = ShotLabellingModel.get_court_position(net_position, next_player_position)            
            direction = ShotLabellingModel.get_shot_direction(handedness, side, court_position, next_court_position)                    
        
        # Create label following the format
        label = f"{court_position}_{side}_{shot_type}_{direction}_{formation}_{outcome}"        
        print(label)
        return {
            "player": player,
            "frame_number": frame_number,
            "label": label,
            "outcome": outcome,
            "handedness": handedness
        }