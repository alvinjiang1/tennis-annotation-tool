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

class DualImageTennisCNN(nn.Module):
    def __init__(self, num_classes, pretrained=True):
        super(DualImageTennisCNN, self).__init__()
        # Create two separate backbones for player and partner
        self.player_backbone = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2 if pretrained else None)
        self.partner_backbone = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2 if pretrained else None)
        
        self.player_features = nn.Sequential(*list(self.player_backbone.children())[:-1])
        self.partner_features = nn.Sequential(*list(self.partner_backbone.children())[:-1])
        
        # Get feature dimensions (2048 for ResNet50)
        self.feature_dim = 2048
        
        self.classifier = nn.Sequential(
            nn.Linear(self.feature_dim * 2, 512),  # Combine features from both players
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes)
        )
    
    def forward(self, player_img, partner_img):
        # Extract features from both images
        player_features = self.player_features(player_img)
        partner_features = self.partner_features(partner_img)
        
        # Flatten feature maps
        player_features = torch.flatten(player_features, 1)
        partner_features = torch.flatten(partner_features, 1)
        
        # Concatenate features from both images
        combined_features = torch.cat((player_features, partner_features), dim=1)
        
        # Pass through classifier
        output = self.classifier(combined_features)
        
        return output

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

# Updated training function to load both player and partner images
def train_epoch(model, dataloader, criterion, optimizer, device, transform, second_path='image_path_partner'):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for batch in tqdm(dataloader, desc="Training"):
        # Get labels and image paths
        labels = batch['serve_type'].to(device)
        player_image_paths = batch['image_path']
        partner_image_paths = batch[second_path]
        
        # Load and transform images for both players
        player_images = []
        partner_images = []
        
        # Process player images
        for path in player_image_paths:
            try:
                img = Image.open(path).convert('RGB')
                img = transform(img)
                player_images.append(img)
            except Exception as e:
                print(f"Error loading player image {path}: {e}")
                # Create a blank image if loading fails
                img = torch.zeros(3, 224, 224)
                player_images.append(img)
        
        # Process partner images
        for path in partner_image_paths:
            try:
                img = Image.open(path).convert('RGB')
                img = transform(img)
                partner_images.append(img)
            except Exception as e:
                print(f"Error loading partner image {path}: {e}")
                # Create a blank image if loading fails
                img = torch.zeros(3, 224, 224)
                partner_images.append(img)
        
        # Stack images into batch tensors
        if player_images and partner_images:
            player_images = torch.stack(player_images).to(device)
            partner_images = torch.stack(partner_images).to(device)
            
            # Zero the parameter gradients
            optimizer.zero_grad()
            
            # Forward pass with both images
            outputs = model(player_images, partner_images)
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
