from flask import jsonify
from google import genai
from google.genai import types

import json
import os
import PIL.Image
from dotenv import load_dotenv


load_dotenv()
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

if not GEMINI_API_KEY:
    print("GEMINI_API_KEY not found in environment variables")

DATA_DIR = "data"
RALLIES_PATH = os.path.join(DATA_DIR, "rallies")
OUTPUT_PATH = os.path.join(DATA_DIR, "generated_labels")
POSE_COORDINATES = os.path.join(DATA_DIR, "pose_coordinates")
IMAGES_PATH = os.path.join(DATA_DIR, "pose_frames")
PROMPT_PATH = "models/shot_labelling/llm_tennis_rally_prompt_json.txt"
with open(PROMPT_PATH, 'r') as f:
    PROMPT = f.read()

client = genai.Client(api_key=GEMINI_API_KEY)

def predict_rallies_gemini(video_id):
    # images_path = os.path.join(IMAGES_PATH, video_id)
    # rallies_path = os.path.join(RALLIES_PATH, f'{video_id}_rallies.json')
    # pose_coordinates_path = os.path.join(POSE_COORDINATES, f'{video_id}_pose.json')
    # output_path = os.path.join(OUTPUT_PATH, f"{video_id}_labelled.json")

    # if not os.path.exists(rallies_path):
    #     return jsonify({"error": "No rallies found for this video"}), 404
    # if not os.path.exists(pose_coordinates_path):
    #     return jsonify({"error": "No pose coordinates found for this video"}), 404
        
    # with open(rallies_path, 'r') as f:
    #     rallies = json.load(f)
    # with open(pose_coordinates_path, 'r') as f2:
    #     pose_coordinates = json.load(f2)        
    
    # predicted_rallies = []
    # # Iterate through the rallies in the json file
    # for rally in rallies:
    #     frame_numbers = rallies[rally]
    #     pose_coordinates_context = {
    #         f"frame_{frame_number}": pose_coordinates[f"frame_{frame_number}"]
    #         for frame_number in frame_numbers
    #     }
    #     images = [PIL.Image.open(os.path.join(images_path, f'{frame_number}_pred.jpg')) for frame_number in frame_numbers]

    #     response = client.models.generate_content(
    #         model="gemini-2.0-flash",
    #         contents=[PROMPT] + images + [json.dumps(pose_coordinates_context)],)
        
    #     print(response.text)
    #     # Assume response is in the format: 
    #     # ```json
    #     #    <content>
    #     # ```
    #     llm_output = response.text[8:-3]
    #     json_content = json.loads(llm_output)
    #     predicted_rallies.append(json_content)

    # output = {
    #     "video_id": video_id,
    #     "rallies": predicted_rallies
    # }
    
    # os.makedirs(OUTPUT_PATH, exist_ok=True)
    # with open(output_path, 'w') as output_file:
    #     json.dump(output, output_file, indent=2)
    return jsonify({"message": "Shot labels successfully generated",
                    "rallies": output}), 200