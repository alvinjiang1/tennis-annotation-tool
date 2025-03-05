
import AnnotationView from '../features/annotation/AnnotationView';
import TrainingView from '../features/training/TrainingView';
import RallyAnalysisView from '../features/rally/RallyAnalysisView'; // Import the new component
import { ANNOTATION, TRAINING, RALLY_ANALYSIS } from '../../hooks/useToolbarTab';

type MainComponentProps = {
  mode: number;
};

export default function MainComponent({ mode }: MainComponentProps) {
  return (
    <>
      {mode === ANNOTATION && <AnnotationView />}
      {mode === TRAINING && <TrainingView />}
      {mode === RALLY_ANALYSIS && <RallyAnalysisView />} 
    </>
  );
}