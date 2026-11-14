import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PresentationSoundCue } from './presentationAnnouncements';
import type { OperatorPresentationScoreboardSection } from './types';
import { PresentationReleaseMotionCoordinator } from './presentationReleaseMotion';

const motionQuery = '(prefers-reduced-motion: reduce)';
function reducedMotion() {
  return window.matchMedia?.(motionQuery).matches ?? false;
}
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener?.('change', listener);
  return () => media?.removeEventListener?.('change', listener);
}

export function usePresentationReleaseMotion({
  scopeKey,
  contestId,
  sections,
  ended,
  updatedAt,
  suppressed = false,
  onCue,
}: {
  scopeKey: string;
  contestId: string;
  sections: OperatorPresentationScoreboardSection[];
  ended: boolean;
  updatedAt: number;
  suppressed?: boolean;
  onCue: (cue: PresentationSoundCue) => void;
}) {
  const [coordinator] = useState(
    () => new PresentationReleaseMotionCoordinator(),
  );
  const state = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    reducedMotion,
    () => false,
  );
  const cueRef = useRef(onCue);
  useEffect(() => {
    cueRef.current = onCue;
  }, [onCue]);
  useEffect(() => {
    const cue = coordinator.update({
      scopeKey,
      contestId,
      sections,
      ended,
      updatedAt,
      now: Date.now(),
      visible: document.visibilityState !== 'hidden',
      reducedMotion: reduced,
      suppressed,
    });
    if (cue) cueRef.current(cue);
  }, [
    scopeKey,
    contestId,
    sections,
    ended,
    updatedAt,
    reduced,
    suppressed,
    coordinator,
  ]);
  useEffect(() => {
    if (state.nextAt === null) return;
    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        // Timers use elapsed time, while the wall clock can move backwards.
        // A fired timer must not leave an unscheduled result overlay behind.
        if (state.nextAt !== null && now < state.nextAt) {
          coordinator.pause();
          return;
        }
        const cue = coordinator.advance(now);
        if (cue) cueRef.current(cue);
      },
      Math.max(0, state.nextAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state.nextAt, coordinator]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') coordinator.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
    };
  }, [coordinator]);
  // Route/auth/filter changes must never show the retained previous audience,
  // even for the render before the update effect establishes its baseline.
  const eligible =
    state.scopeKey === scopeKey && !suppressed && !reduced && ended;
  return {
    sections: eligible ? state.sections : sections,
    reveal: eligible ? state.reveal : null,
    stage: eligible ? state.stage : ('board' as const),
    finish: () => coordinator.finish(Date.now()),
  };
}

export default usePresentationReleaseMotion;
