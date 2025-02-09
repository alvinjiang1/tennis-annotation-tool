import os
import subprocess
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

video_router = Blueprint("video", __name__)
UPLOAD_FOLDER = "uploads"
PROCESSED_FOLDER = "processed"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

@video_router.route("/uploaded-videos", methods=["GET"])
def get_uploaded_videos():
    """
    Returns a list of previously uploaded videos.
    """
    if not os.path.exists(UPLOAD_FOLDER):
        return jsonify({"videos": []})  # Return empty if folder doesn't exist

    videos = sorted(os.listdir(UPLOAD_FOLDER))  # List video files
    return jsonify({"videos": videos})


# Upload and process video
@video_router.route("/upload", methods=["POST"])
def upload_video():
    print("Incoming request:", request.files)

    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    filename_no_ext = os.path.splitext(filename)[0]  # Remove file extension
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    # Create subfolder inside 'processed/' for this video
    video_folder = os.path.join(PROCESSED_FOLDER, filename_no_ext)
    os.makedirs(video_folder, exist_ok=True)

    # Process video with FFmpeg - save frames as 0000.jpg, 0001.jpg, etc.
    output_frames = os.path.join(video_folder, "%04d.jpg")
    ffmpeg_cmd = [
        "ffmpeg", "-i", filepath,
        "-vf", "scale=1280:720",  # Resize all frames to 1280x720
        output_frames
    ]


    subprocess.run(ffmpeg_cmd, check=True)

    return jsonify({"message": "Video uploaded and processed successfully", 
                    "filename": filename})

# Retrieve list of frames
@video_router.route("/frames", methods=["GET"])
def get_extracted_frames():
    filename = request.args.get("filename")
    if not filename:
        return jsonify({"error": "Filename is required"}), 400

    filename_no_ext = os.path.splitext(filename)[0]  # Remove extension
    video_folder = os.path.join(PROCESSED_FOLDER, filename_no_ext)

    if not os.path.exists(video_folder):
        return jsonify({"error": "No frames found"}), 404

    frames = sorted(os.listdir(video_folder))
    return jsonify({"frames": [f"{filename_no_ext}/{frame}" for frame in frames]})

# Serve individual frame images
@video_router.route("/frame/<path:folder>/<path:filename>")
def serve_frame(folder, filename):
    video_folder = os.path.join(PROCESSED_FOLDER, folder)
    if not os.path.exists(os.path.join(video_folder, filename)):
        return jsonify({"error": "File does not exist"}), 404
    return send_from_directory(video_folder, filename)

@video_router.route("/video/<path:filename>")
def serve_video(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

