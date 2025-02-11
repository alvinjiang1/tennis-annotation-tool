import AnnotationView from './AnnotationView';
import TrainingView from './TrainingView';
import ShotLabellingView from './ShotLabellingView';
import { ANNOTATION, TRAINING, SHOT_LABELLING } from '../routes/useToolbarTab';

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
