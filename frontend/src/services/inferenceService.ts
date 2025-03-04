import { apiClient } from './apiClient';

interface InferenceStatus {
  running: boolean;
  last_status: string | null;
}

interface InferenceResult {
  success: boolean;
  frames?: string[];
  error?: string;
}

export const inferenceService = {
  async getInferenceStatus(): Promise<InferenceStatus> {
    try {
      return await apiClient.get<InferenceStatus>('/api/inference/run/status');
    } catch (error) {
      console.error('Error fetching inference status:', error);
      return { running: false, last_status: 'Error fetching status' };
    }
  },
  
  async runInference(imageUrl: string): Promise<InferenceResult> {
    try {
      const result = await apiClient.post('/api/inference/run', { image_url: imageUrl });
      return { success: true, ...result };
    } catch (error) {
      console.error('Error running inference:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },
  
  async getInferenceFrames(videoFilename: string): Promise<string[]> {
    try {
      const data = await apiClient.get<{ frames: string[] }>(`/api/inference/frames?filename=${videoFilename}`);
      return data.frames.map(frame => `${API_BASE_URL}/api/inference/frame/${frame}`);
    } catch (error) {
      console.error('Error fetching inference frames:', error);
      return [];
    }
  }
};