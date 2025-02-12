import { useEffect, useState } from "react";
import { getInferingStatus } from "./api";

const TrainingStatus: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      const data = await getInferingStatus();
      setIsRunning(data.running);
      setStatus(data.last_status);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h3 className="text-lg font-bold">Inference Status</h3>
      <p>{isRunning ? "Obtaining GroundingDINO predictions..." : "Idle"}</p>
      <p>Status: {status || "No recent training"}</p>
    </div>
  );
};

export default TrainingStatus;
