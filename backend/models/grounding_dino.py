import json
import os
import random
import sys
import time
import torch
import numpy as np
import cv2
import supervision as sv

from argparse import Namespace
from groundingdino.util.inference import load_model
from groundingdino.models.registry import MODULE_BUILD_FUNCS

from util.get_param_dicts import get_param_dict
from util.logger import setup_logger
from util.slconfig import DictAction, SLConfig
from util.utils import  BestMetricHolder
import util.misc as utils

# Define paths for GroundingDINO configuration & weights
GPU_NUM=1
MODEL_CONFIG_PATH="checkpoints/GroundingDINO_SwinT_OGC.py"
# DATASETS="config/datasets_mixed_odvg.json"
OUTPUT_DIR="output"
MODEL_WEIGHTS_PATH = "checkpoints/groundingdino_swint_ogc.pth"
TEXT_ENCODER_TYPE="bert"

args = Namespace(config_file=MODEL_CONFIG_PATH,
                 output_dir=OUTPUT_DIR,
                 pretrain_model_path=MODEL_WEIGHTS_PATH,
                 options={'text_encoder_type': TEXT_ENCODER_TYPE})


def build_model_main(args):
    # we use register to maintain models from catdet6 on.
    from groundingdino.models.registry import MODULE_BUILD_FUNCS
    assert args.modelname in MODULE_BUILD_FUNCS._module_dict

    build_func = MODULE_BUILD_FUNCS.get(args.modelname)
    model, criterion, postprocessors = build_func(args)
    return model, criterion, postprocessors

# Load GroundingDINO Model
def load_grounding_dino(device="cuda"):
    """
    Loads the GroundingDINO model with fine-tuned weights.

    Returns:
        Model: A GroundingDINO model ready for inference.
    """
    if not os.path.exists(MODEL_CONFIG_PATH) or not os.path.exists(MODEL_WEIGHTS_PATH):
        print(os.path.exists(MODEL_CONFIG_PATH))
        raise FileNotFoundError("Model config or checkpoint file is missing. Check the paths.")

    model = load_model(MODEL_CONFIG_PATH, MODEL_WEIGHTS_PATH)
    return model
#     utils.setup_distributed(args)
#     # load cfg file and update the args
#     print("Loading config file from {}".format(args.config_file))
#     time.sleep(args.rank * 0.02)
#     cfg = SLConfig.fromfile(args.config_file)
#     if args.options is not None:
#         cfg.merge_from_dict(args.options)
#     if args.rank == 0:
#         save_cfg_path = os.path.join(args.output_dir, "config_cfg.py")
#         cfg.dump(save_cfg_path)
#         save_json_path = os.path.join(args.output_dir, "config_args_raw.json")
#         with open(save_json_path, 'w') as f:
#             json.dump(vars(args), f, indent=2)
#     cfg_dict = cfg._cfg_dict.to_dict()
#     args_vars = vars(args)
#     for k,v in cfg_dict.items():
#         if k not in args_vars:
#             setattr(args, k, v)
#         else:
#             raise ValueError("Key {} can used by args only".format(k))

#     # update some new args temporally
#     if not getattr(args, 'debug', None):
#         args.debug = False

#     # setup logger
#     os.makedirs(args.output_dir, exist_ok=True)
#     logger = setup_logger(output=os.path.join(args.output_dir, 'info.txt'), distributed_rank=args.rank, color=False, name="detr")

#     logger.info("git:\n  {}\n".format(utils.get_sha()))
#     logger.info("Command: "+' '.join(sys.argv))
#     if args.rank == 0:
#         save_json_path = os.path.join(args.output_dir, "config_args_all.json")
#         with open(save_json_path, 'w') as f:
#             json.dump(vars(args), f, indent=2)
#         logger.info("Full config saved to {}".format(save_json_path))

#     # with open(args.datasets) as f:
#     #     dataset_meta = json.load(f)
#     # if args.use_coco_eval:
#     #     args.coco_val_path = dataset_meta["val"][0]["anno"]

#     logger.info('world size: {}'.format(args.world_size))
#     logger.info('rank: {}'.format(args.rank))
#     logger.info('local_rank: {}'.format(args.local_rank))
#     logger.info("args: " + str(args) + '\n')

#     device = torch.device(args.device)
#     # fix the seed for reproducibility
#     seed = args.seed + utils.get_rank()
#     torch.manual_seed(seed)
#     np.random.seed(seed)
#     random.seed(seed)


#     logger.debug("build model ... ...")
#     model, criterion, postprocessors = build_model_main(args)
#     wo_class_error = False
#     model.to(device)
#     logger.debug("build model, done.")

#     return model

# Run inference using the model
def run_inference(model, image_path: str, caption="tennis player", box_threshold=0.35, text_threshold=0.25):
    """
    Runs object detection using GroundingDINO.

    Args:
        model: The loaded GroundingDINO model.
        image_path: Path to the image file.
        caption: Text prompt for detection (e.g., "tennis player").
        box_threshold: Confidence threshold for bounding boxes.
        text_threshold: Confidence threshold for text matching.

    Returns:
        List[Dict]: Detected bounding boxes and labels.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    image = cv2.imread(image_path)
    detections, phrases = model.predict_with_caption(
        image=image,
        caption=caption,
        box_threshold=box_threshold,
        text_threshold=text_threshold
    )

    # Convert detections to JSON format
    results = []
    for i, box in enumerate(detections.xyxy):
        results.append({
            "x1": int(box[0]),
            "y1": int(box[1]),
            "x2": int(box[2]),
            "y2": int(box[3]),
            "label": phrases[i]
        })

    return results

# Fine-tune the model with new training data
def fine_tune_model(model, training_data):
    """
    Fine-tunes the GroundingDINO model using provided annotations.

    Args:
        model: Pretrained GroundingDINO model.
        training_data: List of { "image": path, "boxes": [...] }.

    Returns:
        Path to the newly fine-tuned model.
    """
    try:
        updated_model_path = "checkpoints/fine_tuned_gdino_latest.pth"

        # Ensure the training logic from your notebook is implemented correctly
        # (This part depends on how the notebook trains the model)
        print("Starting fine-tuning... (Implementation needs to match notebook training)")

        # Placeholder: Save the updated model checkpoint
        torch.save(model.model.state_dict(), updated_model_path)

        return updated_model_path
    except Exception as e:
        raise RuntimeError(f"Training failed: {e}")
