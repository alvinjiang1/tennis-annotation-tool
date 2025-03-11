import os
import subprocess
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

video_router = Blueprint("video", __name__)

# base directory configuration
BASE_DIR = "data"
RAW_FRAMES_DIR = os.path.join(BASE_DIR, "raw_frames")
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

# create necessary directories
for directory in [BASE_DIR, RAW_FRAMES_DIR, UPLOAD_FOLDER]:
    os.makedirs(directory, exist_ok=True)

def extract_frames(video_path, video_id):
    # extracts and resizes frames to 1280x720 from uploaded video
    frames_dir = os.path.join(RAW_FRAMES_DIR, video_id)
    os.makedirs(frames_dir, exist_ok=True)
    
    output_frames = os.path.join(frames_dir, "%04d.jpg")
    ffmpeg_cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", "scale=1280:720",
        output_frames
    ]
    subprocess.run(ffmpeg_cmd, check=True)
    return frames_dir

@video_router.route("/uploaded-videos", methods=["GET"])
def get_uploaded_videos():
    # lists all videos in the uploads directory
    if not os.path.exists(UPLOAD_FOLDER):
        return jsonify({"videos": []})

    videos = sorted(os.listdir(UPLOAD_FOLDER))
    return jsonify({"videos": videos})

@video_router.route("/upload", methods=["POST"])
def upload_video():
    # immediate frame extraction here
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    video_id = os.path.splitext(filename)[0]
    
    video_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(video_path)
    
    try:
        frames_dir = extract_frames(video_path, video_id)
        frame_count = len(os.listdir(frames_dir))
        
        return jsonify({
            "message": "Video uploaded and frames extracted successfully",
            "filename": filename,
            "frame_count": frame_count
        })
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Frame extraction failed: {str(e)}"}), 500

@video_router.route("/frames/<video_id>", methods=["GET"])
def get_video_frames(video_id):
    video_id = video_id.split(".")[0]
    
    # returns list of extracted frames for a video
    frames_dir = os.path.join(RAW_FRAMES_DIR, video_id)
    
    if not os.path.exists(frames_dir):
        return jsonify({"error": "No frames found for this video"}), 404

    frames = sorted(os.listdir(frames_dir))
    return jsonify({
        "video_id": video_id,
        "frames": frames,
        "frame_count": len(frames)
    })

@video_router.route("/frame/<video_id>/<frame_filename>")
def serve_frame(video_id, frame_filename):    
    video_id = video_id.split(".")[0]    
    # Serves individual frame image files
    frames_dir = os.path.join(RAW_FRAMES_DIR, video_id)
    
    if not os.path.exists(os.path.join(frames_dir, frame_filename)):        
        return jsonify({"error": "Frame does not exist"}), 404
        
    return send_from_directory(frames_dir, frame_filename)

@video_router.route("/video/<filename>")
def serve_video(filename):
    # Serves the original video file
    return send_from_directory(UPLOAD_FOLDER, filename)

@video_router.route("/check/<video_id>", methods=["GET"])
def check_video_readiness(video_id):
    """Check if video frames and annotations are available"""
    
    # Check for frames
    frames_path = os.path.join("data", "raw_frames", video_id)
    has_frames = os.path.exists(frames_path) and len(os.listdir(frames_path)) > 0
    
    # Check for annotations
    annotations_path = os.path.join("data", "annotations", f"{video_id}_coco_annotations.json")
    has_annotations = os.path.exists(annotations_path)
    
    # Prepare message
    message = []
    if not has_frames:
        message.append("Video frames not found")
    if not has_annotations:
        message.append("Annotations not found")
    
    return jsonify({
        "frames": has_frames,
        "annotations": has_annotations,
        "message": ". ".join(message) if message else "Ready for training"
    })
    
@video_router.route("/check_inference/<video_id>", methods=["GET"])
def check_inference_readiness(video_id):
    """Check if video frames and annotations are available"""
    
    # Check for frames
    frames_path = os.path.join("data", "raw_frames", video_id)
    has_frames = os.path.exists(frames_path) and len(os.listdir(frames_path)) > 0
    
    # Check for annotations
    annotations_path = os.path.join("data", "annotations", f"{video_id}_coco_annotations.json")
    has_annotations = os.path.exists(annotations_path)
    
    # Check for predictions
    predictions_path = os.path.join("data", "grounding_frames", video_id)
    has_predictions = os.path.exists(predictions_path) and len(os.listdir(predictions_path)) > 0
    
    # Prepare message
    message = []
    if not has_frames:
        message.append("Video frames not found")
    if not has_annotations:
        message.append("Annotations not found")
    if not has_predictions:
        message.append("Predictions not found")
    
    return jsonify({
        "frames": has_frames,
        "annotations": has_annotations,
        "message": ". ".join(message) if message else "Ready for inference"
    })


@video_router.route("/list", methods=["GET"])
def list_videos():
    """List all videos with their readiness status (frames and annotations)"""
    try:
        # Get all video IDs from raw_frames directory
        raw_frames_path = os.path.join("data", "raw_frames")
        if not os.path.exists(raw_frames_path):
            return jsonify([])
            
        video_ids = [d for d in os.listdir(raw_frames_path) 
                    if os.path.isdir(os.path.join(raw_frames_path, d))]
        
        # Check each video's status
        videos_info = []
        for video_id in video_ids:
            # Check frames
            frames_path = os.path.join(raw_frames_path, video_id)
            has_frames = len(os.listdir(frames_path)) > 0 if os.path.exists(frames_path) else False
            
            # Check annotations
            annotations_path = os.path.join("data", "annotations", f"{video_id}_coco_annotations.json")
            has_annotations = os.path.exists(annotations_path)
            
            # Get original video name from uploads folder (if available)
            video_filename = next((f for f in os.listdir(UPLOAD_FOLDER) 
                                if os.path.splitext(f)[0] == video_id), 
                                f"{video_id}.mp4")
            
            videos_info.append({
                "id": video_id,
                "name": video_filename,
                "has_frames": has_frames,
                "has_annotations": has_annotations,
                "ready": has_frames and has_annotations
            })
        
        return jsonify(videos_info)
        
    except Exception as e:
        return jsonify({"error": f"Failed to list videos: {str(e)}"}), 500    
