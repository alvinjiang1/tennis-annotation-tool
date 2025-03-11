import AnnotateButton from "../features/annotation/AnnotateButton";
import ShotLabelButton from '../features/label_shot/ShotLabelButton';
import TrainingButton from "../features/training/TrainingButton";

type ToolbarProps = {
  setToolbarTab: (tabIndex: number) => void;
};

export default function Toolbar ({setToolbarTab}: ToolbarProps) {
  return (
    <aside className="w-1/5 bg-base-300 p-4 flex flex-col gap-4 shadow-lg">
      <h2 className="text-xl font-bold text-primary">What's next?</h2>
      <AnnotateButton setToolbarTab={setToolbarTab}/>
      <TrainingButton setToolbarTab={setToolbarTab}/>
      <ShotLabelButton setToolbarTab={setToolbarTab}/>      
    </aside>
  );
};