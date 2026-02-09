import { useCallback, useRef } from 'react';

type Direction = 'horizontal' | 'vertical';

export function useResizeHandle(
  direction: Direction,
  onResize: (delta: number) => void
) {
  const startPosRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const handlePointerMove = (ev: PointerEvent) => {
        const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const delta = current - startPosRef.current;
        if (delta !== 0) {
          startPosRef.current = current;
          onResize(delta);
        }
      };

      const handlePointerUp = () => {
        target.releasePointerCapture(e.pointerId);
        target.removeEventListener('pointermove', handlePointerMove);
        target.removeEventListener('pointerup', handlePointerUp);
      };

      target.addEventListener('pointermove', handlePointerMove);
      target.addEventListener('pointerup', handlePointerUp);
    },
    [direction, onResize]
  );

  return { handlePointerDown };
}
