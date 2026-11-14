import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { PresentationAwardsTracker } from './presentationAwards';
import type { OperatorPresentationScoreboardSection } from './types';

const motionQuery = '(prefers-reduced-motion: reduce)';
function reducedMotion() {
  return window.matchMedia?.(motionQuery).matches ?? false;
}
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener?.('change', listener);
  return () => media?.removeEventListener?.('change', listener);
}

type Props = {
  scopeKey: string;
  contestId: string;
  sections: OperatorPresentationScoreboardSection[];
  ended: boolean;
  updatedAt: number;
  ready: boolean;
  suppressed?: boolean;
  onCue: (cue: 'celebration') => void;
};

export function usePresentationAwards({ onCue, ...input }: Props) {
  const [tracker] = useState(() => new PresentationAwardsTracker());
  const state = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot,
    tracker.getSnapshot,
  );
  const reduced = useSyncExternalStore(
    subscribeMotion,
    reducedMotion,
    () => false,
  );
  const cueRef = useRef(onCue);
  const latestRef = useRef(input);
  useEffect(() => {
    cueRef.current = onCue;
  }, [onCue]);
  const {
    scopeKey,
    contestId,
    sections,
    ended,
    updatedAt,
    ready,
    suppressed = false,
  } = input;
  useEffect(() => {
    latestRef.current = {
      scopeKey,
      contestId,
      sections,
      ended,
      updatedAt,
      ready,
      suppressed,
    };
    const cue = tracker.update({
      scopeKey,
      contestId,
      sections,
      ended,
      updatedAt,
      ready,
      suppressed,
      now: Date.now(),
      visible: document.visibilityState !== 'hidden',
    });
    if (cue) cueRef.current(cue);
  }, [
    scopeKey,
    contestId,
    sections,
    ended,
    updatedAt,
    ready,
    suppressed,
    tracker,
    state.pendingCount,
    state.key,
  ]);
  useEffect(() => {
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') tracker.pause();
      else {
        const cue = tracker.update({
          ...latestRef.current,
          now: Date.now(),
          visible: true,
        });
        if (cue) cueRef.current(cue);
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () =>
      document.removeEventListener('visibilitychange', visibilityChanged);
  }, [tracker]);
  useEffect(() => {
    if (state.expiresAt === null) return;
    const expiresAt = state.expiresAt;
    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        // A wall-clock rollback must not leave an old award on screen forever.
        if (now < expiresAt) tracker.pause();
        else tracker.check(now, document.visibilityState !== 'hidden');
      },
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state.expiresAt, tracker]);
  const complete = useCallback(() => {
    const cue = tracker.complete(
      state.key,
      Date.now(),
      document.visibilityState !== 'hidden',
    );
    if (cue) cueRef.current(cue);
  }, [state.key, tracker]);
  // Guard undo/audience changes before effects while refreshing official live
  // scores in place: a fresh all-public poll must not restart the intro/timer.
  const section = tracker.currentSection({
    scopeKey,
    contestId,
    sections,
    ended,
    updatedAt,
    suppressed,
    visible: document.visibilityState !== 'hidden',
  });
  return {
    section,
    complete,
    reducedMotion: reduced,
  };
}

export default usePresentationAwards;
