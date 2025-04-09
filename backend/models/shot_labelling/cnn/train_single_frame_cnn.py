import os
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import torchvision.models as models
import torchvision.transforms as transforms
import matplotlib.pyplot as plt
from datetime import datetime
import json
import random
from tqdm import tqdm
from PIL import Image
import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support, roc_auc_score
import seaborn as sns
from collections import Counter
from torchvision.models import resnet50, ResNet50_Weights, resnet101, ResNet101_Weights, efficientnet_b0, efficientnet_v2_m, EfficientNet_V2_M_Weights

from tennis_dataset import TennisDataset

# CNN model class using a pre-trained backbone
class TennisCNN(nn.Module):
    def __init__(self, num_classes, pretrained=True):
        super(TennisCNN, self).__init__()
        # Use a pre-trained ResNet model
        self.backbone = models.resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
        
        # Replace the final fully connected layer for our classification task
        in_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(in_features, num_classes)
        )
    
    def forward(self, x):
        return self.backbone(x)
    
# Image transformations
def get_transforms():
    train_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomCrop(224),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1, hue=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    test_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    return train_transform, test_transform

# Calculate class weights for balanced training
def calculate_class_weights(dataset):
    # Count samples in each class
    class_counts = Counter()
    for i in range(len(dataset)):
        label = dataset[i]['serve_type'].item()
        class_counts[label] += 1
    
    # Calculate weights: 1 / (frequency)
    total_samples = sum(class_counts.values())
    class_weights = {cls: total_samples / count for cls, count in class_counts.items()}
    
    # Normalize weights so they sum to n_classes
    n_classes = len(class_counts)
    weight_sum = sum(class_weights.values())
    class_weights = {cls: weight * n_classes / weight_sum for cls, weight in class_weights.items()}
    
    # Convert to tensor format for the loss function
    weights = torch.zeros(n_classes)
    for cls, weight in class_weights.items():
        weights[cls] = weight
    
    print(f"Class distribution: {class_counts}")
    print(f"Class weights: {weights}")
    
    return weights, class_counts

# Updated training function to load images during training
def train_epoch(model, dataloader, criterion, optimizer, device, transform):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for batch in tqdm(dataloader, desc="Training"):
        # Get labels and image paths
        labels = batch['serve_type'].to(device)
        image_paths = batch['image_path']
        
        # Load and transform images
        images = []
        for path in image_paths:
            try:
                img = Image.open(path).convert('RGB')
                img = transform(img)
                images.append(img)
            except Exception as e:
                print(f"Error loading image {path}: {e}")
                # Create a blank image if loading fails
                img = torch.zeros(3, 224, 224)
                images.append(img)
        
        # Stack images into a batch tensor
        if images:
            images = torch.stack(images).to(device)
            
            # Zero the parameter gradients
            optimizer.zero_grad()
            
            # Forward pass
            outputs = model(images)
            loss = criterion(outputs, labels)
            
            # Backward pass and optimize
            loss.backward()
            optimizer.step()
            
            # Statistics
            running_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
    
    epoch_loss = running_loss / len(dataloader) if len(dataloader) > 0 else float('inf')
    epoch_acc = 100 * correct / total if total > 0 else 0
    
    return epoch_loss, epoch_acc