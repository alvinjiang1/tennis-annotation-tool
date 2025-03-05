import json
import random
import os
import re
import shutil
from transformers import AutoTokenizer, AutoModel
from models.grounding_dino.GroundingDINO.tools.coco2odvg import coco2odvg

# Directory Structure Constants
BASE_DIR = "data"
ANNOTATIONS_DIR = os.path.join(BASE_DIR, "annotations")
RAW_FRAMES_DIR = os.path.join(BASE_DIR, "raw_frames")
TRAINING_DIR = os.path.join(BASE_DIR, "grounding_dino_training")

# Model Constants
GROUNDING_DINO_PATH = "models/grounding_dino/"
BERT_DIR = os.path.join(GROUNDING_DINO_PATH, "bert")
WEIGHTS_DIR = os.path.join(GROUNDING_DINO_PATH, "weights")

# Dataset split ratios
TRAIN_RATIO = 0.7
VAL_RATIO = 0.2
TEST_RATIO = 0.1

def init_models():
    """Initialize and download required models."""
    # Download Bert if not present
    if not os.path.exists(BERT_DIR):
        os.makedirs(BERT_DIR, exist_ok=True)
        tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
        model = AutoModel.from_pretrained("bert-base-uncased")
        tokenizer.save_pretrained(BERT_DIR)
        model.save_pretrained(BERT_DIR)

    # Download pre-trained GroundingDINO weights if not present
    if not os.path.exists(WEIGHTS_DIR):
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
        os.system("wget -q https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth -P weights/")

def split_dataset(annotations_path, output_dir, video_id):
    """
    Args:
        annotations_path: Path to the input COCO annotations file
        output_dir: Directory to save the split datasets
        video_id: ID of the video being processed
    """
    # Create output directories
    train_dir = os.path.join(output_dir, "train")
    valid_dir = os.path.join(output_dir, "valid")
    test_dir = os.path.join(output_dir, "test")
    
    for dir_path in [train_dir, valid_dir, test_dir]:
        os.makedirs(dir_path, exist_ok=True)

    # Load annotations
    with open(annotations_path, "r") as f:
        data = json.load(f)

    images = data["images"]
    annotations = data["annotations"]
    categories = data["categories"]

    # Shuffle images before splitting
    random.seed(0)  # For reproducibility
    random.shuffle(images)
    
    # Compute split sizes
    num_images = len(images)
    train_size = int(num_images * TRAIN_RATIO)
    val_size = int(num_images * VAL_RATIO)
    
    # Split images
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

    # Copy images to their respective directories and update file paths
    source_dir = os.path.join("data/raw_frames", video_id)
    
    def copy_and_update_images(image_list, dest_dir):
        updated_images = []
        for img in image_list:
            # Get source and destination paths
            source_path = os.path.join(source_dir, img["file_name"])
            dest_path = os.path.join(dest_dir, img["file_name"])
            
            # Copy the image
            try:
                shutil.copy2(source_path, dest_path)
            except Exception as e:
                print(f"Error copying {source_path}: {e}")
                continue
                
            # Update image path in the metadata
            img_copy = img.copy()
            img_copy["file_name"] = os.path.basename(img["file_name"])
            updated_images.append(img_copy)
            
        return updated_images

    # Copy images and update metadata
    train_images = copy_and_update_images(train_images, train_dir)
    val_images = copy_and_update_images(val_images, valid_dir)
    test_images = copy_and_update_images(test_images, test_dir)

    # Prepare output paths and datasets
    datasets = {
        os.path.join(output_dir, "train/_annotations.coco.json"): {
            "images": train_images,
            "annotations": train_annotations,
            "categories": categories
        },
        os.path.join(output_dir, "valid/_annotations.coco.json"): {
            "images": val_images,
            "annotations": val_annotations,
            "categories": categories
        },
        os.path.join(output_dir, "test/_annotations.coco.json"): {
            "images": test_images,
            "annotations": test_annotations,
            "categories": categories
        }
    }

    # Save split datasets
    for path, dataset in datasets.items():
        with open(path, "w") as f:
            json.dump(dataset, f, indent=2)

    return os.path.join(output_dir, "train/_annotations.coco.json")

def modify_coco_2_odvg(categories, video_id):
    print("DEBUG: Categories received:", categories)
    fp = os.path.join(GROUNDING_DINO_PATH, "GroundingDINO/tools/coco2odvg.py")
    input_path = os.path.join(GROUNDING_DINO_PATH, "GroundingDINO/input_params")
    TRAIN_FILE = os.path.join("data/grounding_dino_training/", video_id, "train/_annotations.coco.json")
    
    # Write odvg
    write_datasets_mixed_odvg(video_id)

    for i, cat in enumerate(categories):
        print(f"DEBUG: Processing category {i}: {cat}")
        
    new_id_map = {}
    new_ori_map = {}    
    for cat in categories:
        new_id_map[cat["id"]-1] = cat["id"]
        new_ori_map[str(cat["id"]-1)] = cat["name"]
        print(f"DEBUG: Added to maps: id-1={cat['id']-1}, id={cat['id']}, name={cat['name']}")
    
    with open(fp, 'r') as file:
        content = file.read()

    content = re.sub(r'id_map\s*=\s*\{[^\}]*\}', f'id_map = {new_id_map}', content)
    content = re.sub(r'ori_map\s*=\s*\{[^\}]*\}', f'ori_map = {new_ori_map}', content)
    with open(fp, 'w') as file:
        file.write(content)

    os.makedirs(input_path, exist_ok=True)
    coco2odvg(TRAIN_FILE, os.path.join(f"data/grounding_dino_training/{video_id}/train.jsonl"))

    label_filepath = os.path.join(f"data/grounding_dino_training/{video_id}/label.json")
    with open(label_filepath, 'w') as label_file:
        json.dump(new_ori_map, label_file)


def modify_config_files(categories):
    labels = [cat["name"] for cat in categories]
    label_list_content = f'label_list = {str(labels)}\n'

    g_coco_path = os.path.join(GROUNDING_DINO_PATH, "GroundingDINO/config/cfg_coco.py")
    g_odvg_path = os.path.join(GROUNDING_DINO_PATH, "GroundingDINO/config/cfg_odvg.py")

    for fp in [g_coco_path, g_odvg_path]:
        with open(fp, 'r') as file:
            content = file.readlines()

        # Create new content list
        new_content = []
        label_list_added = False
        skip_next = False

        for i, line in enumerate(content):
            # Skip if this line was marked for skipping
            if skip_next:
                skip_next = False
                continue
                
            # Handle use_coco_eval
            if 'use_coco_eval' in line:
                new_content.append('use_coco_eval = False\n')
                new_content.append('\n')
                new_content.append(label_list_content)
                label_list_added = True
                continue
                
            # Skip existing label_list lines
            if 'label_list' in line:
                skip_next = True  # Skip the next line too (the actual list)
                continue

            # Add other lines normally
            if not (label_list_added and line.strip() == ''):  # Avoid duplicate blank lines
                new_content.append(line)

        # Write the modified content back to file
        with open(fp, 'w') as file:
            file.writelines(new_content)
            
            
def write_datasets_mixed_odvg(video_id):
    dataset_config = {  
        "train": [
            {
                "root": f"data/grounding_dino_training/{video_id}/train",
                "anno": f"data/grounding_dino_training/{video_id}/train.jsonl",
                "label_map": f"data/grounding_dino_training/{video_id}/label.json",
                "dataset_mode": "odvg"
            }
        ],
        "val": [
            {
                "root": f"data/grounding_dino_training/{video_id}/valid",
                "anno": f"data/grounding_dino_training/{video_id}/valid/_annotations.coco.json",
                "label_map": None,
                "dataset_mode": "coco"
            }
        ]
    }
    
    DATASET_PATH = os.path.join(GROUNDING_DINO_PATH, "GroundingDINO", 'config', "datasets_mixed_odvg.json")
    
    with open(DATASET_PATH, 'w') as f:
        import json
        json.dump(dataset_config, f, indent=4)  # Added indent for better readability