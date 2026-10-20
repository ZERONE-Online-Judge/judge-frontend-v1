import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { EggPoint } from './context';
import './EasterEggs.css';

export default function Spotlight({ point }: { point: EggPoint }) {
  const veil = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    let next = point;
    const move = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      next = { x: event.clientX, y: event.clientY };
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          veil.current?.style.setProperty('--spot-x', `${next.x}px`);
          veil.current?.style.setProperty('--spot-y', `${next.y}px`);
          frame = 0;
        });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.cancelAnimationFrame(frame);
    };
  }, [point]);
  return createPortal(
    <div
      ref={veil}
      className="egg-spotlight"
      aria-hidden="true"
      style={
        {
          '--spot-x': `${point.x}px`,
          '--spot-y': `${point.y}px`,
        } as CSSProperties
      }
    />,
    document.body,
  );
}
