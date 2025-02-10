import json
import random
import os
import re
import sys

from GroundingDINO.tools.coco2odvg import coco2odvg
from transformers import AutoTokenizer, AutoModel

# Define dataset split ratios
TRAIN_RATIO = 0.7
VAL_RATIO = 0.2
TEST_RATIO = 0.1

ANNOTATIONS_FILE = "coco_annotations.json"
OUTPUT_DIR = "training_data"
TRAIN_FILE = os.path.join(OUTPUT_DIR, "train/_annotations.coco.json")
VAL_FILE = os.path.join(OUTPUT_DIR, "valid/_annotations.coco.json")
TEST_FILE = os.path.join(OUTPUT_DIR, "test/_annotations.coco.json")

random.seed(0)

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "train"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "valid"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "test"), exist_ok=True)

def init_models():
    # Download Bert
    tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
    model = AutoModel.from_pretrained("bert-base-uncased")
    os.makedirs("bert", exist_ok=True)

    tokenizer.save_pretrained("bert")
    model.save_pretrained("bert")

    # Download pre-trained GroundingDINO weights
    if not os.path.exists("weights"):
        os.system("mkdir weights")
        os.system("cd weights")
        os.system("wget -q https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth")
        os.system("cd ..")
    

def split_dataset():
    """Splits a COCO-style dataset into train, val, and test sets."""
    with open(ANNOTATIONS_FILE, "r") as f:
        data = json.load(f)

    images = data["images"]
    annotations = data["annotations"]
    categories = data["categories"]

    # Shuffle images before splitting
    random.shuffle(images)
    
    # Compute split sizes
    num_images = len(images)
    train_size = int(num_images * TRAIN_RATIO)
    val_size = int(num_images * VAL_RATIO)
    
    train_images = images[:train_size]
    val_images = images[train_size:train_size + val_size]
    test_images = images[train_size + val_size:]

    # Get image_id sets for quick lookup
    train_ids = {img["id"] for img in train_images}
    val_ids = {img["id"] for img in val_images}
    test_ids = {img["id"] for img in test_images}

    # Split annotations based on image_id
    train_annotations = [ann for ann in annotations if ann["image_id"] in train_ids]
    val_annotations = [ann for ann in annotations if ann["image_id"] in val_ids]
    test_annotations = [ann for ann in annotations if ann["image_id"] in test_ids]

    # Save the split datasets
    datasets = {
        TRAIN_FILE: {"images": train_images, "annotations": train_annotations, "categories": categories},
        VAL_FILE: {"images": val_images, "annotations": val_annotations, "categories": categories},
        TEST_FILE: {"images": test_images, "annotations": test_annotations, "categories": categories}
    }

    for path, dataset in datasets.items():
        with open(path, "w") as f:
            json.dump(dataset, f, indent=2)
    print(f"Dataset split complete. Train: {len(train_images)} images, Val: {len(val_images)}, Test: {len(test_images)}.")

def modify_coco_2_odvg(categories):
    fp = "GroundingDINO/tools/coco2odvg.py"

    new_id_map = {}
    new_ori_map = {}    
    for cat in categories:
        new_id_map[cat["id"]-1] = cat["id"]
        new_ori_map[str(cat["id"]-1)] = cat["name"]
    
    with open(fp, 'r') as file:
        content = file.read()

    content = re.sub(r'id_map\s*=\s*\{[^\}]*\}', f'id_map = {new_id_map}', content)
    content = re.sub(r'ori_map\s*=\s*\{[^\}]*\}', f'ori_map = {new_ori_map}', content)
    with open(fp, 'w') as file:
        file.write(content)

    os.makedirs("GroundingDINO/input_params", exist_ok=True)
    coco2odvg(TRAIN_FILE, "GroundingDINO/input_params/train.jsonl")

    label_filepath = "GroundingDINO/input_params/label.json"
    with open(label_filepath, 'w') as label_file:
        json.dump(new_ori_map, label_file)

def modify_config_files(categories):
    labels = [cat["name"] for cat in categories]
    label_list_content = f'label_list = {str(labels)}\n'

    g_coco_path = "GroundingDINO/config/cfg_coco.py"
    g_odvg_path = "GroundingDINO/config/cfg_odvg.py"

    for fp in [g_coco_path, g_odvg_path]:
        with open(fp, 'r') as file:
            content = file.read()
        # Replace use_coco_eval =TRUE with use_coco_eval =FALSE using regex
        content = re.sub(r'use_coco_eval\s*=\s*True', 'use_coco_eval = False', content)

        # Insert label_list after use_coco_eval = FALSE using regex
        content = re.sub(r'use_coco_eval\s*=\s*False', r'use_coco_eval = False\n\n' + label_list_content, content, count=1, flags=re.MULTILINE)

        with open(fp, 'w') as file:
            file.write(content)

    

    
    
