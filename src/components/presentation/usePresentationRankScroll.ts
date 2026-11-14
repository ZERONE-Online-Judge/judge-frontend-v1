import { useLayoutEffect, useRef, type RefObject } from 'react';
import { PRESENTATION_RANK_DURATION } from '@/domains/submissionScoreboard/presentationReleaseMotion';
import type { ScoreboardRow } from '@/domains/submissionScoreboard/types';

// Match the row FLIP's cubic-bezier(0.22, 1, 0.36, 1).
function rankEase(progress: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 14; step++) {
    const t = (low + high) / 2;
    const inverse = 1 - t;
    const x =
      3 * inverse * inverse * t * 0.22 + 3 * inverse * t * t * 0.36 + t * t * t;
    if (x < progress) low = t;
    else high = t;
  }
  return 1 - (1 - (low + high) / 2) ** 3;
}

/** Layout coordinates remain stable while WAAPI translates the row visually. */
function rowTopWithin(row: HTMLElement, scroll: HTMLElement) {
  let top = 0;
  let node: HTMLElement | null = row;
  while (node && node !== scroll) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === scroll ? top : undefined;
}

/** Keep an announced mover visible without scrolling the presentation frame. */
export default function usePresentationRankScroll({
  bodyRef,
  scrollRef,
  rows,
  teamIds,
  rankMoving,
  scopeKey,
}: {
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  rows: ScoreboardRow[];
  teamIds: ReadonlySet<string>;
  rankMoving: boolean;
  scopeKey: string;
}) {
  const previous = useRef({ scopeKey, ranks: new Map<string, number>() });
  const teamKey = JSON.stringify([...teamIds].sort());

  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = {
      scopeKey,
      ranks: new Map(
        rows.flatMap((row) =>
          row.team_id ? [[row.team_id, row.rank] as const] : [],
        ),
      ),
    };
    if (!rankMoving || old.scopeKey !== scopeKey) return;
    const targets = new Set<string>(JSON.parse(teamKey));
    const moved = rows.find(
      (row) =>
        row.team_id &&
        targets.has(row.team_id) &&
        old.ranks.has(row.team_id) &&
        old.ranks.get(row.team_id) !== row.rank,
    );
    const scroll = scrollRef.current;
    const body = bodyRef.current;
    if (!moved || !scroll || !body || scroll.clientHeight <= 0) return;
    const target = [
      ...body.querySelectorAll<HTMLElement>('[data-scoreboard-row]'),
    ].find((row) => row.dataset.scoreboardRow === moved.team_id);
    if (!target) return;
    const top = rowTopWithin(target, scroll);
    if (top === undefined) return;
    const heading =
      scroll.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const visibleTop = scroll.scrollTop + heading + 8;
    const visibleBottom = scroll.scrollTop + scroll.clientHeight - 8;
    const visibleHeight = Math.max(1, visibleBottom - visibleTop);
    const height = Math.min(target.offsetHeight, visibleHeight);
    if (top >= visibleTop && top + height <= visibleBottom) return;
    const end = Math.max(
      0,
      Math.min(
        scroll.scrollHeight - scroll.clientHeight,
        top - heading - 8 - Math.max(0, (visibleHeight - height) / 2),
      ),
    );
    const start = scroll.scrollTop;
    if (Math.abs(end - start) < 1) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      scroll.scrollTo({ top: end, behavior: 'instant' });
      return;
    }

    let frame = 0;
    let stopped = false;
    let expectedTop = start;
    const startedAt = window.performance.now();
    const stop = () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      scroll.removeEventListener('wheel', stop);
      scroll.removeEventListener('touchstart', stop);
      scroll.removeEventListener('pointerdown', stop);
      scroll.removeEventListener('keydown', keydown);
      scroll.removeEventListener('scroll', onScroll);
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        stop();
    };
    const onScroll = () => {
      // Native scrollbar dragging may not dispatch a pointer event to the div.
      if (Math.abs(scroll.scrollTop - expectedTop) > 2) stop();
    };
    const tick = (time: number) => {
      if (stopped) return;
      const progress = Math.min(
        1,
        Math.max(0, (time - startedAt) / PRESENTATION_RANK_DURATION),
      );
      expectedTop = start + (end - start) * rankEase(progress);
      scroll.scrollTo({ top: expectedTop, behavior: 'instant' });
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else stop();
    };
    scroll.addEventListener('wheel', stop, { passive: true });
    scroll.addEventListener('touchstart', stop, { passive: true });
    scroll.addEventListener('pointerdown', stop);
    scroll.addEventListener('keydown', keydown);
    scroll.addEventListener('scroll', onScroll, { passive: true });
    frame = window.requestAnimationFrame(tick);
    return stop;
  }, [bodyRef, scrollRef, rows, teamKey, rankMoving, scopeKey]);
}
