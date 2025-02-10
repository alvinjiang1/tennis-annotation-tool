import { useState } from "react";
import { startTraining } from "./api";

const TrainingButton = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleTrain = async () => {    

    setLoading(true);
    const success = await startTraining();
    setLoading(false);

    if (success) {
      setMessage("Training started successfully!");
    } else {
      setMessage("Failed to start training.");
    }
  };

  return (
    <>
      <button className="btn btn-primary" onClick={handleTrain} disabled={loading}>
        {loading ? "Training..." : "Start Training"}
      </button>
      {message && <p className="text-sm text-gray-600 mt-2">{message}</p>}
    </>
  );
};

export default TrainingButton;
