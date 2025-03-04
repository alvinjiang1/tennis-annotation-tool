import { API_BASE_URL } from './config';

class ApiError extends Error {
  status: number;
  
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/**
 * Base API client for handling HTTP requests with error handling
 */
export const apiClient = {
  async get<T>(endpoint: string): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.message || `Request failed with status ${response.status}`,
          response.status
        );
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        0
      );
    }
  },
  
  async post<T>(endpoint: string, data?: any): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: data instanceof FormData 
          ? {} 
          : { 'Content-Type': 'application/json' },
        body: data instanceof FormData ? data : JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.message || `Request failed with status ${response.status}`,
          response.status
        );
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        0
      );
    }
  }
};