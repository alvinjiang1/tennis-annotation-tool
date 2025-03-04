import { apiClient } from './apiClient';

interface TrainingStatus {
  running: boolean;
  last_status: string | null;
}

export const trainingService = {
  async startTraining(): Promise<boolean> {
    try {
      await apiClient.post('/api/training/train/start');
      return true;
    } catch (error) {
      console.error('Error starting training:', error);
      return false;
    }
  },
  
  async getTrainingStatus(): Promise<TrainingStatus> {
    try {
      return await apiClient.get<TrainingStatus>('/api/training/train/status');
    } catch (error) {
      console.error('Error fetching training status:', error);
      return { running: false, last_status: 'Error fetching status' };
    }
  }
};