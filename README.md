# Tennis Annotation Tool

A web-based annotation tool for tennis match analysis using object detection and bounding box annotations. The tool allows users to upload videos, extract frames, annotate players, and save annotations in COCO format for training an ML model.

---

## Features

### Video Upload & Frame Extraction
- Upload tennis match videos.  
- Extract every frame from the video using FFmpeg.  
- Store frames in a structured folder system for easy retrieval.  

### Frame Navigation & Playback
- Seek bar to navigate frames easily.  
- Fast forward / rewind buttons (1s, 5s, 10s).  

### Bounding Box Annotation
- Draw bounding boxes around players.  
- Player descriptions required before annotating.  
- Live annotation preview while drawing.  
- Vertical and horizontal lines help precisely place boxes.  
- Annotations saved in COCO format locally and through GraphQL.  

### GraphQL & REST API Support
- GraphQL backend to store annotations.  
- REST API for video handling, frame retrieval, and annotation backup.  

### Dockerized Application
- Run backend and frontend in Docker.  
- Persistent volume storage for processed frames.  

---

## Tech Stack

### Frontend
- React + Vite
- DaisyUI + TailwindCSS
- Canvas API for bounding box annotations

### Backend
- Flask (REST API & GraphQL)
- PostgreSQL for annotation storage
- FFmpeg for video processing
- Gunicorn for production

### Infrastructure
- Docker + Docker Compose

---

## Installation & Setup

### Clone the Repository
```sh
git clone https://github.com/alvinjiang1/tennis-annotation-tool.git
cd tennis-annotation-tool
```

### Set Up Docker Containers
```sh
docker compose up --build
```
- backend willl run at http://localhost:5000
- frontend will run at http://localhost:5173

## How to Use
### Upload a Video
Click "Upload Video" and select a match video.
The backend will extract frames from the video.
### Navigate & Select Frames
Use the seek bar or fast forward / rewind buttons.
Select a frame for annotation.
### Annotate Players
Describe each player before drawing boxes.
Draw bounding boxes with real-time preview.
Click "Save Annotations" to store in COCO format and the database.

## Development
### Run Frontend Locally
```sh
cd frontend
npm install
npm run dev
```

### Run Backend Locally
```sh
cd backend
pip install -r requirements.txt
flask run
```

## Upcoming Features
- Finetune GroundingDINO using user-annotated data
- Provide GroundingDINO predictions to aid manual annotations

## License
MIT License
