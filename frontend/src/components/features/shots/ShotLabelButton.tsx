import { SHOT_LABELLING } from "../../../routes/useToolbarTab";

type ShotLabelButtonProps = {
  setToolbarTab: (tabIndex: number) => void;
};

export default function ShotLabelButton({setToolbarTab}: ShotLabelButtonProps) {  
  const handleTabChange = async () => {    
    setToolbarTab(SHOT_LABELLING);
  };
  return (
    <>
      <button className="btn btn-error" onClick={handleTabChange}>Label Shots</button>
    </>
  );
};
