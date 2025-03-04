import { TRAINING } from "../../../routes/useToolbarTab";

type TrainingButtonProps = {
  setToolbarTab: (tabIndex: number) => void;
};

export default function TrainingButton({setToolbarTab}: TrainingButtonProps) {
  const handleTabChange = () => {
    setToolbarTab(TRAINING);
  };

  return (
    <button className="btn btn-primary" onClick={handleTabChange}>
      Training
    </button>
  );
}