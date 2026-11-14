import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';

const preference = '(prefers-reduced-motion: reduce)';
const reducedSnapshot = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.(preference).matches);
function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia?.(preference);
  if (!media) return () => {};
  media.addEventListener?.('change', listener);
  return () => media.removeEventListener?.('change', listener);
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    reducedSnapshot,
    () => true,
  );
}

/** Interpolate confirmed snapshots only; resets and unknown values never drift. */
export function useAnimatedValue(
  value: number | null | undefined,
  scope = '',
  durationMs = 420,
) {
  const target =
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const reduced = useReducedMotion();
  const visible = useDocumentVisibility();
  const canAnimate =
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    visible;
  const [frame, setFrame] = useState(() => ({ scope, target, value: target }));
  const latest = useRef({ scope, value: target });
  const reset =
    scope !== frame.scope ||
    target === null ||
    frame.target === null ||
    target < frame.target ||
    reduced ||
    durationMs <= 0 ||
    !canAnimate;
  // A new execution, a restarted phase or accessibility change must render its
  // actual value immediately, before an animation effect has an opportunity to run.
  if (
    frame.scope !== scope ||
    frame.target !== target ||
    (reset && frame.value !== target)
  ) {
    setFrame({ scope, target, value: reset ? target : frame.value });
  }
  // Commit resets before starting another interpolation. In particular a server
  // rollback must not restart from a lower, still-animating previous frame.
  useEffect(() => {
    latest.current = { scope: frame.scope, value: frame.value };
  }, [frame]);
  useEffect(() => {
    const from = latest.current.scope === scope ? latest.current.value : target;
    if (
      target === null ||
      from === null ||
      reduced ||
      from >= target ||
      durationMs <= 0 ||
      !canAnimate
    ) {
      latest.current = { scope, value: target };
      return;
    }
    let first: number | undefined;
    let id = 0;
    const tick = (timestamp: number) => {
      first ??= timestamp;
      const elapsed = Math.max(
        0,
        Math.min(1, (timestamp - first) / durationMs),
      );
      const next =
        elapsed === 1
          ? target
          : from + (target - from) * (1 - (1 - elapsed) ** 3);
      latest.current = { scope, value: next };
      setFrame({ scope, target, value: next });
      if (elapsed < 1) id = window.requestAnimationFrame(tick);
    };
    id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(id);
  }, [target, scope, reduced, durationMs, canAnimate]);
  return reset ? target : frame.value;
}
