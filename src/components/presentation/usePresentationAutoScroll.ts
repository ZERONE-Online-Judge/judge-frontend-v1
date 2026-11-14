import { useEffect, type RefObject } from 'react';

const EDGE_HOLD_MS = 1_800;
const MANUAL_HOLD_MS = 5_000;
const SCROLL_REGION = '.presentation-stage-board__scroll';
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

type Axis = {
  position: number;
  direction: 1 | -1;
  waitUntil: number;
};

/** Each division owns its scroll position; the presentation frame never pans. */
export default function usePresentationAutoScroll(
  rootRef: RefObject<HTMLElement | null>,
  {
    verticalEnabled,
    horizontalEnabled,
    paused,
    scopeKey,
  }: {
    verticalEnabled: boolean;
    horizontalEnabled: boolean;
    paused: boolean;
    scopeKey: string;
  },
) {
  useEffect(() => {
    const root = rootRef.current;
    if (
      !root ||
      paused ||
      (!verticalEnabled && !horizontalEnabled) ||
      typeof window.requestAnimationFrame !== 'function'
    )
      return;

    const positions = new WeakMap<HTMLElement, { x: Axis; y: Axis }>();
    const manualHold = new WeakMap<HTMLElement, number>();
    const heldRegions = new Set<HTMLElement>();
    let previous = performance.now();
    let resumeAt = previous + EDGE_HOLD_MS;
    let frame = 0;

    const regions = () => [
      ...root.querySelectorAll<HTMLElement>(SCROLL_REGION),
    ];
    const yieldToInteraction = (event: Event) => {
      if (
        event.type === 'pointermove' &&
        (!('buttons' in event) || !event.buttons)
      )
        return;
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      const target = event.target;
      const region =
        target instanceof Element
          ? target.closest<HTMLElement>(SCROLL_REGION)
          : null;
      if (!region || !root.contains(region)) return;
      if (event.type === 'pointerdown' || event.type === 'touchstart')
        heldRegions.add(region);
      manualHold.set(region, performance.now() + MANUAL_HOLD_MS);
      positions.delete(region);
    };
    const releaseInteraction = () => {
      heldRegions.forEach((region) =>
        manualHold.set(region, performance.now() + MANUAL_HOLD_MS),
      );
      heldRegions.clear();
    };
    const visibilityChanged = () => {
      heldRegions.clear();
      previous = performance.now();
      resumeAt = previous + EDGE_HOLD_MS;
      regions().forEach((region) => positions.delete(region));
    };
    const moveAxis = (
      region: HTMLElement,
      axis: Axis,
      horizontal: boolean,
      now: number,
      elapsed: number,
    ) => {
      const actual = horizontal ? region.scrollLeft : region.scrollTop;
      const maximum = horizontal
        ? region.scrollWidth - region.clientWidth
        : region.scrollHeight - region.clientHeight;
      // Retain fractions between frames: browsers may round scrollTop/Left.
      // A focus operation or a resized table can still move the real position.
      if (Math.abs(actual - axis.position) > 2) {
        axis.position = actual;
        axis.waitUntil = now + EDGE_HOLD_MS;
      }
      if (maximum <= 1 || now < axis.waitUntil) return;
      const next = Math.max(
        0,
        Math.min(
          maximum,
          axis.position + axis.direction * (horizontal ? 28 : 22) * elapsed,
        ),
      );
      axis.position = next;
      if (horizontal) region.scrollLeft = next;
      else region.scrollTop = next;
      if (next <= 0 || next >= maximum) {
        axis.direction = next >= maximum ? -1 : 1;
        axis.waitUntil = now + EDGE_HOLD_MS;
      }
    };
    const tick = (now: number) => {
      const elapsed = Math.min(64, Math.max(0, now - previous)) / 1_000;
      previous = now;
      if (!document.hidden && now >= resumeAt) {
        regions().forEach((region) => {
          if (heldRegions.has(region) || now < (manualHold.get(region) ?? 0))
            return;
          let axes = positions.get(region);
          if (!axes) {
            const axis = (position: number): Axis => ({
              position,
              direction: 1,
              waitUntil: now,
            });
            axes = { x: axis(region.scrollLeft), y: axis(region.scrollTop) };
            positions.set(region, axes);
          }
          if (horizontalEnabled) moveAxis(region, axes.x, true, now, elapsed);
          if (verticalEnabled) moveAxis(region, axes.y, false, now, elapsed);
        });
      }
      frame = window.requestAnimationFrame(tick);
    };

    const inputEvents = [
      'wheel',
      'touchstart',
      'touchmove',
      'pointerdown',
      'pointermove',
      'keydown',
    ];
    const releaseEvents = [
      'pointerup',
      'pointercancel',
      'touchend',
      'touchcancel',
    ];
    inputEvents.forEach((name) =>
      root.addEventListener(name, yieldToInteraction, {
        passive: true,
        capture: true,
      }),
    );
    document.addEventListener('visibilitychange', visibilityChanged);
    releaseEvents.forEach((name) =>
      document.addEventListener(name, releaseInteraction, true),
    );
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      inputEvents.forEach((name) =>
        root.removeEventListener(name, yieldToInteraction, true),
      );
      document.removeEventListener('visibilitychange', visibilityChanged);
      releaseEvents.forEach((name) =>
        document.removeEventListener(name, releaseInteraction, true),
      );
    };
  }, [rootRef, verticalEnabled, horizontalEnabled, paused, scopeKey]);
}
