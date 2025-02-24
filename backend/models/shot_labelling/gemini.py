from google import genai
from google.genai import types

import json
import os
import PIL.Image

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
folder_path = "../../data/gemini_test" # For testing purposes
prompt_path = "llm_tennis_rally_prompt_json.txt"
output_file = "output.json"

with open(prompt_path, 'r') as f:
    prompt = f.read()

images = [PIL.Image.open(os.path.join(folder_path, f)) for f in os.listdir(folder_path) if f.endswith('.jpg')]

client = genai.Client(api_key=GEMINI_API_KEY)
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=[prompt] + images,)

# image = PIL.Image.open(os.path.join(folder_path, "0126_pred.jpg"))

# response = client.models.generate_content(
#     model="gemini-2.0-flash",
#     contents=[image, "The tennis players are highlighted in bounding boxes. Describe their physical characteristics and their position on the tennis court (Near/Far, Ad/Deuce)"],)

# Assume response is in the format: 
# ```json
#    <content>
# ```
# output = response.text[8:-3]
# json_content = json.loads(output)

# with open(output_file, 'w') as f:
#     json.dump(json_content, f, indent=4)

print(response.text)

