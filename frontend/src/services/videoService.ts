import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';

interface UploadResponse {
  filename: string;
  success: boolean;
}

interface VideoListResponse {
  videos: string[];
}

interface FramesResponse {
  frames: string[];
  video_id: string;
  frame_count: number;
}

export const videoService = {
  async getUploadedVideos(): Promise<string[]> {
    try {
      const data = await apiClient.get<VideoListResponse>('/api/video/uploaded-videos');
      return data.videos;
    } catch (error) {
      console.error('Error fetching videos:', error);
      return [];
    }
  },
  
  async uploadVideo(videoFile: File): Promise<UploadResponse> {
    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      
      const data = await apiClient.post<UploadResponse>('/api/video/upload', formData);
      return { ...data, success: true };
    } catch (error) {
      console.error('Error uploading video:', error);
      return { 
        filename: '', 
        success: false 
      };
    }
  },
  
  async getVideoFrames(videoFilename: string): Promise<string[]> {
    try {
      // Use the correct URL format with the video ID in the path
      const data = await apiClient.get<FramesResponse>(`/api/video/frames/${videoFilename}`);
      
      // Map the frames to their full URLs
      return data.frames.map(frame => `${API_BASE_URL}/api/video/frame/${data.video_id}/${frame}`);
    } catch (error) {
      console.error('Error fetching video frames:', error);
      return [];
    }
  }
};