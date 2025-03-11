import { useState, useEffect, useCallback } from "react";

const backendUrl = "http://localhost:5000";

// Training API functions
export const startTraining = async (videoId: string): Promise<boolean> => {
    try {
        const response = await fetch(`${backendUrl}/api/training/train/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ video_id: videoId })
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
        const response = await fetch(`${backendUrl}/api/training/train/status`);
        return await response.json();
    } catch (error) {
        console.error("Error fetching training status:", error);
        return { running: false, last_status: "Error fetching status" };
    }
};

export const getInferingStatus = async (): Promise<{ running: boolean; last_status: string | null }> => {
    try {
        const response = await fetch(`${backendUrl}/api/inference/run/status`);
        return await response.json();
    } catch (error) {
        console.error("Error fetching inference status:", error);
        return { running: false, last_status: "Error fetching status" };
    }
};

interface FrameResponse {
    frames: string[];
    error?: string;
}

export default function useFetchFrames(videoId: string, labelShots: boolean) {
    const [frames, setFrames] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFrames = useCallback(async () => {
        if (!videoId) return;

        try {
            setLoading(true);
            setError(null);
            
            const endpoint = labelShots 
                ? `${backendUrl}/api/inference/frames/${videoId}`
                : `${backendUrl}/api/video/frames/${videoId}`;
            
            const response = await fetch(endpoint);
            const data: FrameResponse = await response.json();

            if (response.ok) {
                const frameUrls = data.frames.map((frame: string) => {
                    const baseEndpoint = labelShots
                        ? `${backendUrl}/api/inference/frame/${videoId}`
                        : `${backendUrl}/api/video/frame/${videoId}`;
                    return `${baseEndpoint}/${frame}`;
                });
                
                setFrames(frameUrls);
            } else {
                throw new Error(data.error || "Failed to fetch frames");
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to fetch frames";
            console.error("Failed to fetch frames:", err);
            setError(errorMessage);
            setFrames([]);
        } finally {
            setLoading(false);
        }
    }, [videoId, labelShots]);

    useEffect(() => {
        fetchFrames();
    }, [fetchFrames]);

    return { frames, loading, error, refetch: fetchFrames };
}

export const checkVideoReadiness = async (videoId: string): Promise<{
    frames: boolean;
    annotations: boolean;
    message?: string;
}> => {
    try {
        const response = await fetch(`${backendUrl}/api/video/check/${videoId}`);
        if (!response.ok) {
            throw new Error('Failed to check video readiness');
        }
        return await response.json();
    } catch (error) {
        console.error('Error checking video readiness:', error);
        return { frames: false, annotations: false, message: 'Error checking files' };
    }
};