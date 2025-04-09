import os
import json
import torch
from torch.utils.data import Dataset
import numpy as np
import cv2

class TennisDataset(Dataset):
    """Dataset for loading tennis shot frames with player poses and bounding boxes."""
    
    def __init__(self, data_dir, video_ids=None, train_label='shot_type', max_poses=4):
        self.data_dir = data_dir
        self.max_poses = max_poses
        self.video_ids = video_ids
        self.width = 1920
        self.height = 1080
        
        self.samples = []
        self.serve_types = set()
        self.label_map = {}
        
        # Load and process data
        self._load_data(train_label=train_label)
        
        if not self.label_map:
            self.label_map = {serve_type: idx for idx, serve_type in enumerate(sorted(self.serve_types))}
        
        print(f"Label mapping: {self.label_map}")
        self._print_class_distribution()
    
    def _extract_player_bbox(self, raw_image_path, output_image_path, bbox, target_size=(224, 224)):
        """Extract player from image using bounding box and resize to target size."""
        # Read the image
        image = cv2.imread(raw_image_path)
        if image is None:
            print(f"Failed to read image: {raw_image_path}")
            return None
        
        # Create output directory if needed
        output_dir = os.path.dirname(output_image_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        # Convert normalized coordinates to pixel coordinates
        x_min, y_min, x_max, y_max = bbox
        x_min = int(x_min * self.width)
        y_min = int(y_min * self.height)
        x_max = int(x_max * self.width)
        y_max = int(y_max * self.height)
        
        # Calculate center and expand bounding box
        center_x = (x_min + x_max) // 2
        center_y = (y_min + y_max) // 2
        original_width = x_max - x_min
        original_height = y_max - y_min
        
        # Scale the bbox by 2x while keeping the center fixed
        scaled_width = original_width * 2
        scaled_height = original_height * 2
        
        # Calculate new bbox coordinates with bounds checking
        new_x_min = max(0, center_x - scaled_width // 2)
        new_y_min = max(0, center_y - scaled_height // 2)
        new_x_max = min(self.width, center_x + scaled_width // 2)
        new_y_max = min(self.height, center_y + scaled_height // 2)
        
        # Crop the player from the image using the scaled bbox
        player_image = image[new_y_min:new_y_max, new_x_min:new_x_max]
        
        # If the crop is empty, handle the error
        if player_image.size == 0:
            print(f"Empty bounding box for image: {raw_image_path}")
            return None
        
        # Resize to standardized dimensions for CNN
        standardized_image = cv2.resize(player_image, target_size)
        
        # Save the standardized player image
        cv2.imwrite(output_image_path, standardized_image)
        
        return standardized_image
    
    def _find_hitting_players(self, bboxes, player_position):
        """Find the hitting player and their partner based on positions."""
        if len(bboxes) == 0:
            return -1, -1
        
        # Calculate center points of all bounding boxes
        bbox_centers = np.zeros((len(bboxes), 2))
        for i, bbox in enumerate(bboxes):
            x_min, y_min, x_max, y_max = bbox
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            bbox_centers[i] = [center_x, center_y]
        
        # Find closest player to the provided position
        distances = np.sqrt(np.sum((bbox_centers - player_position) ** 2, axis=1))
        hitting_player_idx = np.argmin(distances)
        hitting_player_center = bbox_centers[hitting_player_idx]
        
        # Find the closest player on the width/x-axis, excluding the hitting player
        width_distances = []
        for i, center in enumerate(bbox_centers):
            if i != hitting_player_idx:
                width_distance = abs(center[0] - hitting_player_center[0])
                width_distances.append((i, width_distance))
        
        if not width_distances:
            return hitting_player_idx, -1
        
        width_distances.sort(key=lambda x: x[1])
        hitting_partner_idx = width_distances[0][0]
        
        return hitting_player_idx, hitting_partner_idx
    
    def _get_bbox(self, frame_data, normalize=True):
        """Extract bounding boxes from frame data."""
        if not frame_data:
            return np.zeros((0, 4))
            
        all_bboxes = []
        for item in frame_data:
            bbox = np.array(item['bbox'])
            
            if normalize:
                x_min, y_min, width, height = bbox
                # Convert to x_min, y_min, x_max, y_max format
                x_max = x_min + width
                y_max = y_min + height
                
                # Normalize to [0, 1] range
                x_min = x_min / self.width
                y_min = y_min / self.height
                x_max = x_max / self.width
                y_max = y_max / self.height
                
                bbox = np.array([x_min, y_min, x_max, y_max])
                
            all_bboxes.append(bbox)
        
        return np.array(all_bboxes)
    
    def _load_data(self, train_label, n=10):
        """Load and process data for the specified training label."""
        print(f'Training for label: {train_label}')
        transform_dir = os.path.join(self.data_dir, 'transformed')
        
        # Videos with a frame offset
        offset_videos = [
            "Granollers_Zeballos vs Arevalo_Rojer  _ Toronto 2023 Doubles Semi-Finals", 
            "Nick Kyrgios_Thanasi Kokkinakis vs Jack Sock_John Isner _ Indian Wells 2022 Doubles Highlights",
            "Rajeev Ram_Joe Salisbury vs Tim Puetz_Michael Venus _ Cincinnati 2022 Doubles Final",
            "Salisbury_Ram vs Krawietz_Puetz  _ Toronto 2023 Doubles Semi-Finals",
        ]
        
        for file in os.listdir(transform_dir):
            if not file.endswith('.json'):
                continue
                
            video_id = '_'.join(file.split('_')[:-1])
            if self.video_ids and video_id not in self.video_ids:
                continue
            
            # Apply offset for certain videos
            offset = 30 if any(video in video_id for video in offset_videos) else 0
            print(f"Using offset: {offset} for video: {video_id}")
            
            with open(os.path.join(transform_dir, file)) as f:
                rally_data = json.load(f)
                    
                for rally in rally_data['rallies']:
                    # Load pose and bbox files
                    pose_file = os.path.join(self.data_dir, 'pose', f"{rally['video_id']}_pose.json")
                    bbox_file = os.path.join(self.data_dir, 'bbox', f"{rally['video_id']}_boxes.json")
                    
                    if not os.path.exists(pose_file) or not os.path.exists(bbox_file):
                        print(f"Pose or bbox file not found for {rally['video_id']}")
                        continue
                        
                    with open(pose_file) as f:
                        pose_data = json.load(f)
                    
                    with open(bbox_file) as f:
                        bbox_data = json.load(f)
                        
                    for event in rally['events']:
                        frame = event['frame']
                        frame_key = f"frame_{(frame + offset):06d}"  # add offset
                        frame_key_n = f"frame_{(frame + offset + n):06d}"  # add offset + n frames
                        
                        # Skip if frames don't exist in pose data
                        if frame_key not in pose_data or frame_key_n not in pose_data:
                            continue
                            
                        # Get bboxes for current and n frames ahead
                        bboxes = self._get_bbox(bbox_data.get(frame_key, []))
                        bboxes_n = self._get_bbox(bbox_data.get(frame_key_n, []))
                        
                        # Get relative player position
                        relative_width = event.get('relative_player_width', 0.0)
                        relative_height = event.get('relative_player_height', 0.0)
                        player_position = np.array([relative_width, relative_height])
                        
                        # Find hitting player and partner
                        hitting_player, hitting_partner = self._find_hitting_players(bboxes, player_position)
                        hitting_player_n = self._find_hitting_player(bboxes_n, player_position)
                        
                        if hitting_partner == -1 or hitting_player == -1 or hitting_player_n == -1:
                            continue
                        
                        # Get bounding boxes
                        hitting_player_bbox = bboxes[hitting_player] 
                        hitting_partner_bbox = bboxes[hitting_partner]
                        hitting_player_n_bbox = bboxes_n[hitting_player_n]
                        
                        # Define paths for images
                        raw_image_path = os.path.join(self.data_dir, 'frames', rally['video_id'], f"{frame_key}.jpg")
                        output_image_path = os.path.join(self.data_dir, 'hitting_player', rally['video_id'], f"frame_{(frame):06d}.jpg")
                        output_image_path_partner = os.path.join(self.data_dir, 'hitting_partner', rally['video_id'], f"frame_{(frame):06d}.jpg")
                        
                        raw_image_path_n = os.path.join(self.data_dir, 'frames', rally['video_id'], f"{frame_key_n}.jpg")
                        output_image_path_n = os.path.join(self.data_dir, 'hitting_player_n', rally['video_id'], f"frame_{(frame + n):06d}.jpg")
                        
                        # Process label based on training task
                        event_type = event['event']
                        serve_parts = event_type.split('_')
                        serve_type = self._extract_label(serve_parts, train_label)
                        
                        if serve_type is None:
                            continue
                        
                        self.serve_types.add(serve_type)
                        
                        # Add sample to dataset
                        self.samples.append({
                            'hitting_player': hitting_player,
                            'hitting_partner': hitting_partner,
                            'hitting_player_n': hitting_player_n,
                            'hitting_player_bbox': bboxes[hitting_player],
                            'hitting_partner_bbox': bboxes[hitting_partner],
                            'hitting_player_n_bbox': hitting_player_n_bbox,
                            'video_id': video_id,
                            'frame': f"frame_{(frame):06d}",
                            'serve_type': serve_type,
                            'side': serve_parts[3],
                            'image_path': output_image_path,
                            'image_path_partner': output_image_path_partner,
                            'image_path_n': output_image_path_n,
                            'player_position': player_position
                        })
    
    def _extract_label(self, serve_parts, train_label):
        """Extract the appropriate label based on the training task."""
        if train_label == 'side':  # forehand/backhand
            is_serve = serve_parts[4]
            if is_serve == 'serve' or is_serve == 'second-serve':
                return None
            return serve_parts[3]
            
        elif train_label == 'shot_type':
            serve_type = serve_parts[4]
            if serve_type == 'serve' or serve_type == 'second-serve':
                return None
            # Normalize return as swing
            if serve_type == 'return':
                serve_type = 'swing'
            return serve_type
            
        elif train_label == 'shot_direction':
            serve_type = serve_parts[5]
            # Normalize directions
            if serve_type == 'cc' or serve_type == 'io':
                return 'cross'
            elif serve_type == 'dl' or serve_type == 'ii':
                return 'straight'
            else:
                return 'cross'
        
        elif train_label == 'serve_direction':
            serve_type = serve_parts[5]
            if serve_type not in ['t', 'w', 'b']:
                return None
            return serve_type

        elif train_label == 'formation':
            is_serve = serve_parts[4]
            if is_serve != 'serve' and is_serve != 'second-serve':
                return None
            return serve_parts[6]

        elif train_label == 'outcome':
            serve_type = serve_parts[7]
            if serve_type == 'in':
                return None
            return serve_type
            
        elif train_label == 'is_serve':
            serve_type = serve_parts[4]
            if serve_type == 'second-serve':
                serve_type = 'serve'
            if serve_type != 'serve':
                serve_type = 'non-serve'
            return serve_type

        else:
            raise ValueError(f'Unknown training label: {train_label}')
    
    def _find_hitting_player(self, bboxes, player_position):
        """Find the index of the closest player to the given position."""
        if len(bboxes) == 0:
            return -1
        
        # Calculate bbox centers
        bbox_centers = np.zeros((len(bboxes), 2))
        for i, bbox in enumerate(bboxes):
            x_min, y_min, x_max, y_max = bbox
            center_x = (x_min + x_max) / 2
            center_y = (y_min + y_max) / 2
            bbox_centers[i] = [center_x, center_y]
        
        # Find closest center to player position
        distances = np.sqrt(np.sum((bbox_centers - player_position) ** 2, axis=1))
        return np.argmin(distances)
    
    def _print_class_distribution(self):
        """Print distribution of classes in the dataset."""
        class_counts = {}
        
        for sample in self.samples:
            label = sample['serve_type']
            if label in class_counts:
                class_counts[label] += 1
            else:
                class_counts[label] = 1
        
        total = len(self.samples)
        print(f"\nClass distribution ({total} samples total):")
        for label, count in class_counts.items():
            percentage = (count / total) * 100
            print(f"  {label}: {count} samples ({percentage:.2f}%)")
    
    def __getitem__(self, idx):
        """Get a sample from the dataset."""
        sample = self.samples[idx]
        
        return {
            'hitting_player': torch.tensor(sample['hitting_player'], dtype=torch.long),
            'hitting_partner': torch.tensor(sample['hitting_partner'], dtype=torch.long),
            'hitting_player_n': torch.tensor(sample['hitting_player_n'], dtype=torch.long),
            'serve_type': torch.tensor(self.label_map[sample['serve_type']], dtype=torch.long),
            'image_path': sample['image_path'],
            'image_path_partner': sample['image_path_partner'],
            'image_path_n': sample['image_path_n'],
        }
    
    def __len__(self):
        """Return the number of samples in the dataset."""
        return len(self.samples)