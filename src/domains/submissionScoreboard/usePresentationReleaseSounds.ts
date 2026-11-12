import { useEffect, useRef, useState } from 'react';
import type { PresentationSoundCue } from '@/domains/submissionScoreboard/presentationAnnouncements';
import { PresentationReleaseSoundTracker } from '@/domains/submissionScoreboard/presentationReleaseSound';
import type { OperatorPresentationScoreboardSection } from '@/domains/submissionScoreboard/types';

export function usePresentationReleaseSounds({
  contestId,
  sections,
  ended,
  updatedAt,
  onCue,
  suppressed = false,
}: {
  contestId: string;
  sections: OperatorPresentationScoreboardSection[];
  ended: boolean;
  updatedAt: number;
  onCue: (cue: PresentationSoundCue) => void;
  suppressed?: boolean;
}) {
  const [tracker] = useState(() => new PresentationReleaseSoundTracker());
  const cueRef = useRef(onCue);
  useEffect(() => {
    cueRef.current = onCue;
  }, [onCue]);
  useEffect(() => {
    const cue = tracker.update({
      contestId,
      sections,
      ended,
      updatedAt,
      now: Date.now(),
      visible: document.visibilityState !== 'hidden',
      suppressed,
    });
    if (cue) cueRef.current(cue);
  }, [contestId, sections, ended, updatedAt, suppressed, tracker]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') tracker.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [tracker]);
}
