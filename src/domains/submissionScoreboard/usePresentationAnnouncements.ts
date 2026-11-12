import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  PRESENTATION_ANNOUNCEMENT_STORAGE_KEY,
  PresentationAnnouncementTracker,
  readPresentationAnnouncementMemory,
} from './presentationAnnouncements';
import type {
  PresentationAnnouncementContest,
  PresentationSoundCue,
} from './presentationAnnouncements';

function loadTracker() {
  try {
    return new PresentationAnnouncementTracker(
      readPresentationAnnouncementMemory(
        window.sessionStorage.getItem(PRESENTATION_ANNOUNCEMENT_STORAGE_KEY),
      ),
    );
  } catch {
    return new PresentationAnnouncementTracker();
  }
}

export function usePresentationAnnouncements({
  contest,
  now,
  onCue,
  suppressed = false,
}: {
  contest?: PresentationAnnouncementContest;
  now: number;
  onCue?: (cue: PresentationSoundCue) => void;
  suppressed?: boolean;
}) {
  const [tracker] = useState(loadTracker);
  const activeAnnouncement = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot,
    tracker.getSnapshot,
  );
  const cueRef = useRef(onCue);
  useEffect(() => {
    cueRef.current = onCue;
  }, [onCue]);
  useEffect(() => {
    const result = tracker.advance(contest, now, {
      visible: document.visibilityState !== 'hidden',
      suppressed,
    });
    if (result.changed) {
      try {
        window.sessionStorage.setItem(
          PRESENTATION_ANNOUNCEMENT_STORAGE_KEY,
          JSON.stringify(tracker.memory(now)),
        );
      } catch {
        // The in-memory ledger still prevents repeats in private browsing.
      }
    }
    if (result.cue) cueRef.current?.(result.cue);
  }, [contest, now, suppressed, tracker]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== 'hidden') return;
      tracker.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [tracker]);
  return {
    activeAnnouncement,
    dismiss: tracker.dismiss,
  };
}
