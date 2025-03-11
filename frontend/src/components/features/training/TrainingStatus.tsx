import { useEffect, useState } from "react";
import { getTrainingStatus } from "../../../services/api";

const TrainingStatus: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      const data = await getTrainingStatus();
      setIsRunning(data.running);
      setStatus(data.last_status);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h3 className="text-lg font-bold">Training Status</h3>
      <p>{isRunning ? "Training in progress..." : "Idle"}</p>
      <p>Status: {status || "No recent training"}</p>
    </div>
  );
};

export default TrainingStatus;
