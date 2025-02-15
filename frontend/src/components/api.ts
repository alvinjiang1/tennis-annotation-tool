import { useState, useEffect } from "react";

const backendUrl = "http://localhost:5000";

// Training API functions
export const startTraining = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${backendUrl}/api/training/train/start`, {
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
    frame_count: number;
    video_id: string;
    error: string;
}

export default function useFetchFrames(videoFilename: string, labelShots: boolean) {
    const [frames, setFrames] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!videoFilename) return;

        const fetchFrames = async () => {
            try {
                setLoading(true);
                setError(null);
                
                const videoId = videoFilename.split('.')[0]; // Remove file extension
                let response;

                if (labelShots) {
                    // Fetch predicted frames (inference results)
                    response = await fetch(`${backendUrl}/api/inference/frames/${videoId}`);
                } else {
                    // Fetch original frames from new endpoint
                    response = await fetch(`${backendUrl}/api/video/frames/${videoId}`);
                }

                const data: FrameResponse = await response.json();

                if (response.ok) {
                    const frameUrls = data.frames.map((frame: string) => {
                        if (labelShots) {
                            return `${backendUrl}/api/inference/frame/${videoId}/${frame}`;
                        } else {
                            return `${backendUrl}/api/video/frame/${videoId}/${frame}`;
                        }
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
        };

        fetchFrames();
    }, [videoFilename, labelShots]);

    return { frames, loading, error };
}