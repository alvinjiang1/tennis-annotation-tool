# TennisDINO — Tennis Annotation Tool
---

<p align="center">
  <img display=flex, src="https://github.com/user-attachments/assets/434339be-9f4c-437a-a5d4-68b4408445f0" width=50% height=50%>
</p>  


A web-based annotation tool for tennis doubles match analysis, built with React Typescript-Vite on the frontend and Flask on the backend. The tool allows users to upload videos, extract frames, annotate players, perform Bounding Box prediction using GroundingDINO, and automatically generate a set of tennis shot labels using either Gemini-2.0 Flash or CNNs. Both frontend and backend components should be run locally on GPU-supported machines for optimal performance. A video demo of the tennis annotation tool is available [here](https://www.youtube.com/watch?v=nXhNrud8wdU).

## Overview
The following diagram represents how a high-level overview of the tennis annotation workflow:
![architecture drawio](https://github.com/user-attachments/assets/2c0c9417-8b3e-432b-91e2-61803598967d)

## Features

### Video Upload & Frame Extraction
- Upload doubles match videos.  
- Extract every frame from the video using FFmpeg.  
- Store frames in a structured folder system for easy retrieval.  

### Frame Navigation & Playback
- Seek bar to navigate frames easily.
- Forward and backward buttons to advance and rewind frames
- Keyboard shortcuts for ease of frame navigation.

### Bounding Box Annotation for Few-shot Finetuning
- Draw bounding boxes around players.  
- Annotate tennis players based on physical characteristics.  
- Live annotation preview while drawing.  
- Vertical and horizontal lines help precisely place boxes.  
- Annotations saved in COCO format locally.

### GroundingDINO Finetuning & Inference
- Initiate finetuning of GroundDINO using annotated few-shot dataset with the press of a button.
- Perform Bounding Box prediction using finetuned GroundingDINO
- Perform pose estimation using YOLO-pose model
- Visualise predicted Bounding Boxes and Pose Keypoints.

### Automated Shot Label Generation
- Automatically detect shot type, technique, and direction (e.g., serve, volley, crosscourt).
- Supports frame-by-frame analysis for precise shot timing.
- Compatible with pre-trained models like CNNs or multi-modal LLM.
- Easily extensible to include custom or fine-tuned models.
- Outputs structured shot labels for downstream tasks with shot data.

---

## Tech Stack

### Frontend
- React + Vite
- DaisyUI + TailwindCSS
- Canvas API for bounding box annotations

### Backend
- Flask (REST API)
- FFmpeg for video processing
- GroundingDINO for Open-set Object Detection
- YOLO-Pose for pose estimation
- Gemini-2.0 Flash for automated shot label prediction
- CNN-based methods for automated shot label prediction
---

## Installation & Setup

Note: Before proceeding, if you are using a CUDA environment, ensure that the `CUDA_HOME` environment variable has been properly set.

### Clone the Repository
```sh
git clone https://github.com/alvinjiang1/tennis-annotation-tool.git
cd tennis-annotation-tool
```

### Setup Gemini API Key
To use Gemini-MLLM during shot predictions, set up your [Gemini API Key](https://ai.google.dev/gemini-api/docs). Otherwise, selecting Gemini MLLM during shot label generation will fail to produce shot labels. Add your API Key in a `.env` file in the `backend` folder.
```env
GEMINI_API_KEY="your_api_key"
```

### Setup Virtual Environment
Create and activate a virtual environment using conda. Use Python 3.11.11 as the interpreter.
```sh
conda create --name tennis-dino python=3.11.11
conda activate tennis-dino
```

### Install Models
Install GroundingDINO, BERT, YOLO-Pose, and download all pretrained weights using the provided setup script:
```sh
cd backend
chmod +x setup.sh
./setup.sh
cd ..
```

### Run Frontend Locally
Frontend will run at http://localhost:5173
```sh
cd frontend
npm install
npm run dev
```

### Run Backend Locally
backend willl run at http://localhost:5000
```sh
cd backend
python app.py
```

## License
MIT License
