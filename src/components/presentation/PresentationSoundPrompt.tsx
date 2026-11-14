import { useEffect, useId, useRef, useState } from 'react';
import './PresentationSoundPrompt.css';

type Props = {
  contestId: string;
  supported: boolean;
  onEnable: () => Promise<boolean>;
  onLater?: () => void;
  onOpenChange?: (open: boolean) => void;
};

const STORAGE_PREFIX = 'zoj.presentation.sound-prompt.v1.';
const completedInMemory = new Set<string>();

function completed(contestId: string) {
  if (completedInMemory.has(contestId)) return true;
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + contestId) === 'done';
  } catch {
    return false;
  }
}

/** An invitation only: never steals focus or blocks the presentation. */
export default function PresentationSoundPrompt(props: Props) {
  if (!props.supported) return null;
  return <SoundPrompt key={props.contestId} {...props} />;
}

function SoundPrompt({ contestId, onEnable, onLater, onOpenChange }: Props) {
  const [dismissed, setDismissed] = useState(() => completed(contestId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const openRef = useRef(false);
  const openChangeRef = useRef(onOpenChange);
  const descriptionId = useId();

  useEffect(() => {
    openRef.current = !dismissed;
    openChangeRef.current = onOpenChange;
    onOpenChange?.(!dismissed);
  }, [dismissed, onOpenChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (openRef.current) openChangeRef.current?.(false);
    };
  }, []);

  function finish() {
    completedInMemory.add(contestId);
    try {
      window.sessionStorage.setItem(STORAGE_PREFIX + contestId, 'done');
    } catch {
      // Keep the choice for this tab's mounted app when storage is blocked.
    }
    setDismissed(true);
  }

  function later() {
    if (pendingRef.current) return;
    onLater?.();
    finish();
  }

  async function enable() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      const enabled = await onEnable();
      if (!mountedRef.current) return;
      if (enabled) finish();
      else setError('소리를 켜지 못했습니다. 다시 시도해 주세요.');
    } catch {
      if (mountedRef.current)
        setError('소리를 켜지 못했습니다. 다시 시도해 주세요.');
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  if (dismissed) return null;
  return (
    <aside
      className="presentation-sound-prompt"
      role="dialog"
      aria-modal="false"
      aria-label="프레젠테이션 효과음"
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        // Do not let the default gesture-unlock treat "later" as consent.
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          later();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="presentation-sound-prompt__heading">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
        </svg>
        <h2>효과음을 켤까요?</h2>
      </div>
      <p id={descriptionId}>카운트다운과 결과 공개를 소리로 알려드립니다.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="presentation-sound-prompt__actions">
        <button type="button" onClick={later} disabled={pending}>
          나중에
        </button>
        <button
          type="button"
          className="presentation-sound-prompt__enable"
          onClick={() => void enable()}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? '켜는 중…' : '효과음 켜기'}
        </button>
      </div>
    </aside>
  );
}
