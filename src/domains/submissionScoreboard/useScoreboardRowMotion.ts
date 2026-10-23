import { useLayoutEffect, useRef } from 'react';
import type { ScoreboardRow } from './types';

/** Animate published rank changes while keeping the table in its actual rank order. */
export default function useScoreboardRowMotion(
  rows: ScoreboardRow[],
  duration = 850,
) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    const next = new Map<string, number>();
    const origin = body.getBoundingClientRect().top;
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    body
      .querySelectorAll<HTMLElement>('[data-scoreboard-row]')
      .forEach((row) => {
        const key = row.dataset.scoreboardRow!;
        const top = row.getBoundingClientRect().top - origin;
        next.set(key, top);
        const previous = positions.current.get(key);
        if (previous === undefined || reducedMotion || !row.animate) return;
        const distance = previous - top;
        if (Math.abs(distance) < 1) return;
        animations.current.push(
          row.animate(
            [
              { transform: `translateY(${distance}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          ),
        );
      });
    positions.current = next;
  }, [rows, duration]);

  useLayoutEffect(
    () => () => {
      animations.current.forEach((animation) => animation.cancel());
    },
    [],
  );

  return bodyRef;
}
