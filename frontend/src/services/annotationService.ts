import { apiClient } from './apiClient';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface SaveAnnotationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const annotationService = {
  async saveAnnotations(
    imageUrl: string, 
    boundingBoxes: BoundingBox[], 
    width: number, 
    height: number
  ): Promise<SaveAnnotationResponse> {
    try {
      const result = await apiClient.post<SaveAnnotationResponse>('/api/annotation/save', {
        image_url: imageUrl,
        bounding_boxes: boundingBoxes,
        width,
        height
      });
      
      return { success: true, ...result };
    } catch (error) {
      console.error('Error saving annotations:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};