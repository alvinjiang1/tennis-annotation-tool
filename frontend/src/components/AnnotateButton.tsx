import { ANNOTATION } from "../routes/useToolbarTab";

type AnnotateButtonProps = {
  setToolbarTab: (tabIndex: number) => void;
};

export default function AnnotateButton({setToolbarTab}: AnnotateButtonProps) {  
  const handleTabChange = async () => {    
    setToolbarTab(ANNOTATION);
  };
  return (
    <>
      <button className="btn btn-accent" onClick={handleTabChange}>Annotate </button>
    </>
  );
};
