import { useState, useEffect } from "react";
const backendUrl = "http://localhost:5000"
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

export const getInferingStatus = async (): Promise<{ running: boolean; last_status: string | null }> => {
  try {
      const response = await fetch("http://localhost:5000/api/inference/run/status");
      return await response.json();
  } catch (error) {
      console.error("Error fetching inference status:", error);
      return { running: false, last_status: "Error fetching status" };
  }
};

export default function useFetchFrames(videoFilename: string, labelShots: boolean) {
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoFilename) return;

    const fetchFrames = async () => {
      try {
        setLoading(true);
        let response;
        
        // Fetch predicted frames (inference results) if labelShots is true
        if (labelShots) {
          response = await fetch(`${backendUrl}/api/inference/frames?filename=${videoFilename}`);
        } else {
          // Fetch original frames
          response = await fetch(`${backendUrl}/api/video/frames?filename=${videoFilename}`);
        }

        const data = await response.json();

        if (response.ok) {
          if (labelShots) {
            setFrames(data.frames.map((frame: string) => `${backendUrl}/api/inference/frame/${frame}`));
          } else {
            setFrames(data.frames.map((frame: string) => `${backendUrl}/api/video/frame/${frame}`));
          }
          
        } else {
          console.error("Error fetching frames:", data.error);
          setError("Failed to fetch frames.");
        }
      } catch (err) {
        console.error("Failed to fetch frames:", err);
        setError("Failed to fetch frames.");
      } finally {
        setLoading(false);
      }
    };

    fetchFrames();
  }, [videoFilename, labelShots]); // Include labelShots in dependencies

  return { frames, loading, error };
}
