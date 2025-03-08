import AnnotationView from '../features/annotation/AnnotationView';
import TrainingView from '../features/training/TrainingView';
import RallyAnalysisView from '../features/rally/RallyAnalysisView';
import ShotGeneratorView from '../features/shot_generator/ShotGeneratorView';
import { ANNOTATION, TRAINING, RALLY_ANALYSIS, SHOT_GENERATOR } from '../../hooks/useToolbarTab';

type MainComponentProps = {
  mode: number;
};

export default function MainComponent({ mode }: MainComponentProps) {
  return (
    <>
      {mode === ANNOTATION && <AnnotationView />}
      {mode === TRAINING && <TrainingView />}
      {mode === RALLY_ANALYSIS && <RallyAnalysisView />}
      {mode === SHOT_GENERATOR && <ShotGeneratorView />}
    </>
  );
}