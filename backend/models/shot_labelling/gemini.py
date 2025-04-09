from flask import jsonify
from google.genai import Client
import json
import os
import random
import time

from models.shot_labelling.shot_labelling_model import ShotLabellingModel

class GeminiModel(ShotLabellingModel):
    def __init__(self, step_size=2):
        super().__init__(id="gemini")
        self.name = "Gemini (MLLM)"
        self.description = "Gemini 2.0-Flash (MLLM Generator) to generate labels based on multimodal input"
        self.model_name = "gemini-2.0-flash-lite"
        GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')        
        self.client = Client(api_key=GEMINI_API_KEY)        
        self.step_size = step_size # Set step size to a high number like 1000 to include only first and last frames
        print("Setting up Gemini Model with step size", self.step_size)
        
    def parse_gemini_response(self, output):
        """Parse Gemini json formatted response and return json string"""            
        return output.split("```")[1][4:]        

    def generate_shot_labels(self, hitting_moments, rally_info, pose_data, categories, player_descriptions):
        """Generate labels for a single rally based on hitting moments and additional information"""
        
        # Get net position from rally data if available
        net_position = self.net_position
        end_frame = rally_info.get("endFrame", None)
        end_ball_pos = rally_info.get("endBallPosition", None)
        
        # Generate events for each hitting moment
        events = []            
        n = len(hitting_moments)
        
        # First pass: collect all frames we need to analyze to batch image fetching
        frame_images = {}
        for i, moment in enumerate(hitting_moments):
            start_frame = moment.get("frameNumber", 0) + 1
            
            # For non-last shots, we need frames up to the next shot
            if i < n - 1:
                end_frame_range = hitting_moments[i+1].get("frameNumber", 0) + 1
            else:
                # For last shot, we need frames up to the end frame
                end_frame_range = end_frame
                
            # Get all frames between start and end using step_size
            frames = self.get_images_from_frame_numbers(start_frame, end_frame_range, self.step_size)
            
            # Store frames with their corresponding frame numbers
            for j, frame_img in enumerate(frames):
                frame_num = start_frame + (j * self.step_size)
                if frame_num <= end_frame_range:  # Ensure we don't go beyond the range
                    frame_images[frame_num] = frame_img                    
            # Ensure the end frame is included
            if end_frame_range not in frame_images:                            
                frame_images[end_frame_range] = self.get_image_from_frame_number(end_frame_range)
                
        
        # Process serve separately (if rally has at least one moment)
        if n > 0:
            is_serve_moment = hitting_moments[0]
            serve_data = None
            start_frame = is_serve_moment.get("frameNumber", 0) + 1
            
            if n > 1:
                # Get next moment for serve analysis
                next_moment = hitting_moments[1]
                end_frame_range = next_moment.get("frameNumber", 0) + 1
                
                # Get all frames between serve and next shot
                sequence_frames = []
                for frame_num in range(start_frame, end_frame_range + 1, self.step_size):
                    if frame_num in frame_images:
                        sequence_frames.append(frame_images[frame_num])
                # Include end frame if not already in sequence
                if end_frame_range not in sequence_frames:
                    sequence_frames.append(frame_images[end_frame_range])
                
                serve_data = self.analyze_serve_sequence(is_serve_moment, next_moment, sequence_frames)
            else:
                # Single shot rally (serve only)
                # Get all frames between serve and end of rally
                sequence_frames = []
                for frame_num in range(start_frame, end_frame + 1, self.step_size):
                    if frame_num in frame_images:
                        sequence_frames.append(frame_images[frame_num])
                # Include end frame if not already in sequence
                if frame_images[end_frame_range] not in sequence_frames:
                    sequence_frames.append(frame_images[end_frame_range])
                serve_data = self.analyze_serve_sequence(is_serve_moment, (end_frame, end_ball_pos), sequence_frames, is_last=True)
            
            # Add serve event
            if serve_data:
                frame_number = is_serve_moment.get("frameNumber", 0) + 1
                player = self.get_player_from_hitting_moment(is_serve_moment)
                handedness = self.get_player_handedness(player, self.get_categories())
                
                event = {
                    "player": player,
                    "frame": frame_number,
                    "label": serve_data["label"],
                    "outcome": serve_data["outcome"],
                    "handedness": handedness
                }
                
                player_position = is_serve_moment.get("playerPosition", None)
                if player_position:
                    event['player_position'] = player_position
                events.append(event)                
                print(event['label'])
                time.sleep(0.5)
        
        # Process all non-serve shots
        if n > 1:
            for i in range(1, n):
                moment = hitting_moments[i]
                is_return = (i == 1)
                is_last = (i == n - 1)
                start_frame = moment.get("frameNumber", 0) + 1
                
                # Get appropriate end frame
                if is_last:
                    end_frame_range = end_frame
                    next_moment = (end_frame, end_ball_pos)
                else:
                    next_moment = hitting_moments[i+1]
                    end_frame_range = next_moment.get("frameNumber", 0) + 1
                
                # Get all frames between current shot and next shot/end
                sequence_frames = []
                for frame_num in range(start_frame, end_frame_range + 1, self.step_size):
                    if frame_num in frame_images:
                        sequence_frames.append(frame_images[frame_num])
                # Include end frame if not already in sequence
                if frame_images[end_frame_range] not in sequence_frames:
                    sequence_frames.append(frame_images[end_frame_range])
                # Generate shot label
                shot_info = self.analyze_shot_sequence(moment, next_moment, net_position, is_return, is_last, sequence_frames)
                
                # Add event with all available data
                player = self.get_player_from_hitting_moment(moment)
                handedness = self.get_player_handedness(player, self.get_categories())
                
                event = {
                    "player": player,
                    "frame": start_frame,
                    "label": shot_info["label"],
                    "outcome": shot_info["outcome"],
                    "handedness": handedness
                }
                
                player_position = moment.get("playerPosition", None)
                if player_position:
                    event['player_position'] = player_position
                events.append(event)
                print(event['label'])
                time.sleep(0.5) # Sleep to circumvent rate limiting
        
        # Create rally output
        rally_labels = {
            "player_descriptons": player_descriptions,
            "events": events
        }
        
        if net_position:
            rally_labels["net_position"] = net_position

        return rally_labels
    
    def analyze_serve_sequence(self, moment, next_moment, sequence_frames, is_last=False):
        """Analyze serve shot using a sequence of frames"""
        frame_number = moment.get("frameNumber", 0) + 1
        player = self.get_player_from_hitting_moment(moment)
        player_position = moment.get("playerPosition", None)
        court_position = ShotLabellingModel.get_court_position(self.net_position, player_position)
        handedness = self.get_player_handedness(player, self.get_categories())
        
        # Skip if no frames available
        if not sequence_frames:
            # Default values
            formation = "conventional"
            direction = "t"
            outcome = "in" if not is_last else "win"
            label = f"{court_position}_forehand_serve_{direction}_{formation}_{outcome}"
            return {"label": label, "outcome": outcome}
        
        # Handle next moment
        if isinstance(next_moment, tuple):
            next_frame, end_ball_pos = next_moment
            
            # Comprehensive prompt for serve analysis
            serve_prompt = f"""Analyze this tennis serve sequence and provide the following information in JSON format:
            1. formation: Either 'i-formation' or 'conventional'
            2. direction: Either 't' for T-serve, 'b' for body serve, 'w' for wide serve
            3. outcome: Either 'win' for winner or 'err' for error if this is the last shot, otherwise 'in'

            Context information:
            - Player ID: {player}
            - Player position: {player_position}
            - Ending ball position: {end_ball_pos}
            - This is the serve and {"is" if is_last else "is not"} the last shot of the rally
            - You are seeing a sequence of {len(sequence_frames)} frames showing the serve progression

            Output JSON only with these three keys and their values.
            """
        else:
            # For non-last serve
            # Comprehensive prompt for serve analysis
            serve_prompt = f"""Analyze this tennis serve sequence and provide the following information in JSON format:
            1. formation: Either 'i-formation' or 'conventional'
            2. direction: Either 't' for T-serve, 'b' for body serve, 'w' for wide serve

            Context information:
            - Player ID: {player}
            - Player position: {player_position}
            - This is the serve shot
            - You are seeing a sequence of {len(sequence_frames)} frames showing the serve progression

            Output JSON only with these two keys and their values.
            """
        
        # Make API call with multiple images
        contents = [serve_prompt] + sequence_frames
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
        )
        
        try:
            serve_analysis = json.loads(self.parse_gemini_response(response.text))
            formation = serve_analysis.get("formation", "conventional")
            direction = serve_analysis.get("direction", "t")
            outcome = serve_analysis.get("outcome", "in" if not is_last else "win")
        except json.JSONDecodeError:
            print("Error parsing JSON response", response.text)
            # Fallback if JSON parsing fails
            formation = "conventional"
            direction = "t"
            outcome = "in" if not is_last else "win"
        
        # Create label following the format
        label = f"{court_position}_forehand_serve_{direction}_{formation}_{outcome}"
        
        return {
            "label": label,
            "outcome": outcome,
        }

    def analyze_shot_sequence(self, moment, next_moment, net_position, is_return, is_last, sequence_frames):
        """Analyze non-serve shot using a sequence of frames"""
        frame_number = moment.get("frameNumber", 0) + 1
        player = self.get_player_from_hitting_moment(moment)
        player_position = moment.get("playerPosition", None)
        court_position = ShotLabellingModel.get_court_position(net_position, player_position)
        handedness = self.get_player_handedness(player, self.get_categories())
        
        # Skip if no frames available
        if not sequence_frames:
            # Default values
            side = "forehand"
            shot_type = "return" if is_return else "swing"
            direction = "cc"
            outcome = "in" if not is_last else "win"
            label = f"{court_position}_{side}_{shot_type}_{direction}_non-serve_{outcome}"
            return {"label": label, "outcome": outcome}
        
        if isinstance(next_moment, tuple):
            # Last shot in rally
            next_frame, end_ball_pos = next_moment
            
            # Comprehensive prompt for last shot analysis
            shot_prompt = f"""Analyze this tennis shot sequence and provide the following information in JSON format in lower case:
            1. side: Either 'forehand' or 'backhand'
            2. shot_type: Either 'return' (if this is a return shot), 'swing', 'volley', 'lob', or 'smash'
            3. direction: Either 'ii' for inside-in, 'io' for inside out, 'dl' for down the line, 'cc' for cross-court
            4. outcome: Either 'win' for winner or 'err' for error

            Context information:
            - Player ID: {player}
            - Player position: {player_position}
            - Player handedness: {handedness}
            - Court position: {court_position}
            - Ending ball position: {end_ball_pos}
            - This {"is" if is_return else "is not"} a return shot
            - This is the last shot of the rally
            - You are seeing a sequence of {len(sequence_frames)} frames showing the shot progression

            Output JSON only with these four keys and their values.
            """
            # Make API call with multiple images
            contents = [shot_prompt] + sequence_frames
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents,
            )
            
            try:
                shot_analysis = json.loads(self.parse_gemini_response(response.text))
                side = shot_analysis.get("side", "forehand")
                shot_type = shot_analysis.get("shot_type", "return" if is_return else "swing")
                direction = shot_analysis.get("direction", "cc")
                outcome = shot_analysis.get("outcome", "win")
            except json.JSONDecodeError:
                print("Error parsing JSON response", response.text)
                # Fallback if JSON parsing fails
                side = "forehand"
                shot_type = "return" if is_return else "swing"
                direction = "cc"
                outcome = "win"
        else:
            # Normal shot with next hitting moment
            next_player = self.get_player_from_hitting_moment(next_moment)
            next_player_position = next_moment.get("playerPosition", None)
            
            # Comprehensive prompt for normal shot analysis
            shot_prompt = f"""Analyze this tennis shot sequence and provide the following information in JSON format:
            1. side: Either 'forehand' or 'backhand'
            2. shot_type: Either 'return' (if this is a return shot), 'swing', 'volley', 'lob', or 'smash'

            Context information:
            - Player ID: {player}
            - Player position: {player_position}
            - Next player ID: {next_player}
            - Next player position: {next_player_position}
            - This {"is" if is_return else "is not"} a return shot
            - This is not the last shot of the rally
            - You are seeing a sequence of {len(sequence_frames)} frames showing the shot progression

            Output JSON only with these two keys and their values.
            """
            # Make API call with multiple images
            contents = [shot_prompt] + sequence_frames
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents,
            )
            
            try:
                shot_analysis = json.loads(self.parse_gemini_response(response.text))
                side = shot_analysis.get("side", "forehand")
                shot_type = shot_analysis.get("shot_type", "return" if is_return else "swing")
                
                # Direction for non-last shot is derived algorithmically rather than via API
                next_court_position = ShotLabellingModel.get_court_position(net_position, next_player_position)
                direction = ShotLabellingModel.get_shot_direction(handedness, side, court_position, next_court_position)
                outcome = "in"  # Non-last shot is always "in"
            except json.JSONDecodeError:
                print("Error parsing JSON response", response.text)
                # Fallback if JSON parsing fails
                side = "forehand"
                shot_type = "return" if is_return else "swing"
                next_court_position = ShotLabellingModel.get_court_position(net_position, next_player_position)
                direction = ShotLabellingModel.get_shot_direction(handedness, side, court_position, next_court_position)
                outcome = "in"
        
        # Create label following the format
        label = f"{court_position}_{side}_{shot_type}_{direction}_non-serve_{outcome}"
        
        return {
            "label": label,
            "outcome": outcome,
        }