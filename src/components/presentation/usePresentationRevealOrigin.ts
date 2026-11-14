import { useLayoutEffect, useRef, type RefObject } from 'react';
import type {
  PresentationReveal,
  PresentationReleaseMotionSnapshot,
} from '@/domains/submissionScoreboard/presentationReleaseMotion';

const properties = ['top', 'right', 'bottom', 'left'] as const;

/** Measure the old public board, so the result opens from its actual source. */
export default function usePresentationRevealOrigin(
  rootRef: RefObject<HTMLElement | null>,
  reveal: PresentationReveal | null,
  stage: PresentationReleaseMotionSnapshot['stage'],
) {
  const captured = useRef<string | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!reveal || stage === 'board') {
      captured.current = null;
      properties.forEach((side) =>
        root.style.removeProperty(`--reveal-source-${side}`),
      );
      return;
    }
    if (stage !== 'focusing' || captured.current === reveal.key) return;
    properties.forEach((side) =>
      root.style.removeProperty(`--reveal-source-${side}`),
    );
    const board = [
      ...root.querySelectorAll<HTMLElement>('[data-presentation-division]'),
    ].find(
      (element) => element.dataset.presentationDivision === reveal.divisionId,
    );
    if (!board) return;
    const rows = [
      ...board.querySelectorAll<HTMLElement>('[data-active-team="true"]'),
    ];
    const target =
      reveal.kind === 'resolver'
        ? (rows[0]?.querySelector<HTMLElement>('.is-active-problem') ?? rows[0])
        : rows.length === 1
          ? rows[0]
          : undefined;
    const header = board.querySelector<HTMLElement>(
      '.presentation-stage-board__header',
    );
    const visible = (element?: HTMLElement | null) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      return right - left >= 8 && bottom - top >= 8
        ? { left, right, top, bottom }
        : undefined;
    };
    const rect = visible(target) ?? visible(header);
    properties.forEach((side) =>
      root.style.removeProperty(`--reveal-source-${side}`),
    );
    if (rect) {
      const insets = {
        top: rect.top,
        left: rect.left,
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.bottom,
      };
      properties.forEach((side) =>
        root.style.setProperty(`--reveal-source-${side}`, `${insets[side]}px`),
      );
    }
    captured.current = reveal.key;
  }, [rootRef, reveal, stage]);
}
