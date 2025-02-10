export const startTraining = async (): Promise<boolean> => {
    try {
      const response = await fetch("http://localhost:5000/api/training/train/start", {
        method: "POST"        
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to start training");
      }
  
      return true;
    } catch (error) {
      console.error("Error starting training:", error);
      return false;
    }
};

export const getTrainingStatus = async (): Promise<{ running: boolean; last_status: string | null }> => {
    try {
        const response = await fetch("http://localhost:5000/api/training/train/status");
        return await response.json();
    } catch (error) {
        console.error("Error fetching training status:", error);
        return { running: false, last_status: "Error fetching status" };
    }
};
  
  