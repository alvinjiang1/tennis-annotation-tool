# Use official Python image
ARG BASE_IMAGE=pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime
ARG MODEL_SIZE=base_plus

FROM ${BASE_IMAGE}

# Set working directory
WORKDIR /app

# Copy backend files
COPY . /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libavutil-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    pkg-config \
    build-essential \
    libffi-dev

# Install dependencies
RUN pip install -r requirements.txt

RUN cd GroundingDINO/models/GroundingDINO/ops && \
    python setup.py build install

# Expose the backend port
EXPOSE 5000

# Run the Flask application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]

