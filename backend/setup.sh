echo "Installing GroundingDINO..."
mkdir -p models/pretrained
cd models/pretrained
folder=GroundingDINO
url=https://github.com/IDEA-Research/GroundingDINO.git
if ! git clone "${url}" "${folder}" 2>/dev/null && [ -d "${folder}" ] ; then
    echo "Clone failed because the folder ${folder} exists"
fi
cd -

echo "Updating extension files..."
file_path=models/pretrained/GroundingDINO/groundingdino/models/GroundingDINO/csrc/MsDeformAttn/ms_deform_attn_cuda.cu
sed -i '65s/value.type()/value.scalar_type()/g' ${file_path}
sed -i '135s/value.type()/value.scalar_type()/g' ${file_path}
echo "Installing GroundingDINO packages..."
cd models/pretrained/GroundingDINO
pip install -e .
cd -

echo "Installing required backend packages..."
pip install -r requirements.txt
cd models/grounding_dino/GroundingDINO/models/GroundingDINO/ops
python setup.py build install
python test.py
cd -

# Create folders and download weights
echo "Setting up model directories and downloading weights..."

# GroundingDINO
mkdir -p models/grounding_dino/weights
cd models/grounding_dino/weights
if [ ! -f "groundingdino_swint_ogc.pth" ]; then
    echo "Downloading GroundingDINO weights..."
    wget -q https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth
else
    echo "GroundingDINO weights already exist, skipping download..."
fi
cd -

# BERT
mkdir -p models/grounding_dino/bert
cd models/grounding_dino/bert
if [ ! -f "model.safetensors" ]; then
    echo "Downloading BERT weights..."
    wget https://huggingface.co/google-bert/bert-base-uncased/resolve/main/model.safetensors
else
    echo "BERT weights already exist, skipping download..."
fi
cd -

# YOLO-Pose
cd models/pose_estimation
if [ ! -f "yolo11x-pose.pt" ]; then
    echo "Downloading YOLO-pose weights..."
    wget https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11x-pose.pt
else
    echo "YOLO-pose weights already exist, skipping download..."
fi
cd -

# CNN Weights are to be added under models/shot_labelling/cnn/<model type> separately

echo "All model weights downloaded successfully!"
