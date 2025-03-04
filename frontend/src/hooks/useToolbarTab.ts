import { useState } from 'react';

export const ANNOTATION = 0;
export const TRAINING = 1;
export const SHOT_LABELLING = 2;

export default function useToolbarTab(initialTab = ANNOTATION) {
  const [toolbarTab, setToolbarTab] = useState(initialTab);

  return { toolbarTab, setToolbarTab };
}
