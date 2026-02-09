import { useCallback } from 'react';
import { useVideoStore } from '../stores/video-store';

export function useFrameStepping() {
  const frameStep = useVideoStore((s) => s.frameStep);

  const stepForward = useCallback(() => frameStep(1), [frameStep]);
  const stepBackward = useCallback(() => frameStep(-1), [frameStep]);

  return { stepForward, stepBackward };
}
