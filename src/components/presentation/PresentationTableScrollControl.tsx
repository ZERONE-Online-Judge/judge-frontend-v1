import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import './PresentationTableScrollControl.css';

/** Keep horizontal navigation visible even with a mouse or hidden OS scrollbars. */
export default function PresentationTableScrollControl({
  scrollRef,
  label,
  fontScale,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  label: string;
  fontScale: number;
}) {
  const [position, setPosition] = useState({ left: 0, maximum: 0 });
  const frameRef = useRef(0);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    // Keep the beginning reachable when a larger font reflows the table.
    scroll.scrollLeft = 0;
    const measure = () => {
      const maximum = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      const left = Math.max(0, Math.min(maximum, scroll.scrollLeft));
      setPosition((previous) =>
        Math.abs(previous.left - left) < 0.5 &&
        Math.abs(previous.maximum - maximum) < 0.5
          ? previous
          : { left, maximum },
      );
    };
    const schedule = () => {
      if (frameRef.current) return;
      if (typeof window.requestAnimationFrame !== 'function') {
        measure();
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
        measure();
      });
    };
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(scroll);
    const table = scroll.querySelector('table');
    if (table) observer?.observe(table);
    scroll.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      observer?.disconnect();
      scroll.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.cancelAnimationFrame?.(frameRef.current);
      frameRef.current = 0;
    };
  }, [scrollRef, fontScale]);

  if (position.maximum <= 1) return null;
  const move = (left: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, Math.min(position.maximum, left));
    setPosition((previous) => ({ ...previous, left: scroll.scrollLeft }));
  };
  const percent = Math.round((position.left / position.maximum) * 100);
  return (
    <div className="presentation-table-pan" data-presentation-scroll-control>
      <button
        type="button"
        aria-label={`${label} 왼쪽으로 이동`}
        disabled={position.left <= 1}
        onClick={() =>
          move(position.left - (scrollRef.current?.clientWidth ?? 0) * 0.7)
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>
      <input
        type="range"
        min="0"
        max={Math.ceil(position.maximum)}
        step="1"
        value={position.left}
        aria-label={`${label} 점수표 가로 이동`}
        aria-valuetext={`${percent}% · 좌우로 이동하여 모든 문제 확인`}
        onChange={(event) => move(Number(event.target.value))}
      />
      <button
        type="button"
        aria-label={`${label} 오른쪽으로 이동`}
        disabled={position.left >= position.maximum - 1}
        onClick={() =>
          move(position.left + (scrollRef.current?.clientWidth ?? 0) * 0.7)
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m10 6 6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
