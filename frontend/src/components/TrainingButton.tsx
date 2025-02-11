import { useState } from "react";
import { startTraining } from "./api";
import { TRAINING } from "../routes/useToolbarTab";

type TrainingButtonProps = {
  setToolbarTab: (tabIndex: number) => void;
};

export default function TrainingButton({setToolbarTab}: TrainingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleTrain = async () => {    

    setLoading(true);
    const success = await startTraining();
    setLoading(false);

    setToolbarTab(TRAINING);

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
