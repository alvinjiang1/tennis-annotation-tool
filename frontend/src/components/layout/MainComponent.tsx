import AnnotationView from '../features/annotation/AnnotationView';
import TrainingView from '../features/training/TrainingView';
import ShotLabellingView from '../features/shots/ShotLabellingView';
import { ANNOTATION, TRAINING, SHOT_LABELLING } from '../../routes/useToolbarTab';

type MainComponentProps = {
  mode: number;
};

export default function DemoVideoEditor({ mode }: MainComponentProps) {
  return (
    <>
      {mode === ANNOTATION && <AnnotationView />}
      {mode === TRAINING && <TrainingView />}
      {mode === SHOT_LABELLING && <ShotLabellingView />}
    </>
  );
}
