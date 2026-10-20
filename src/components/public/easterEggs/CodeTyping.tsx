import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import Modal from '@/shared/ui/Modal';
import type { EggOrigin } from './context';
import { TYPING_SOURCE, typingSpeed } from './typing';
import './EasterEggs.css';

export default function CodeTyping({
  origin,
  onClose,
}: {
  origin: EggOrigin;
  onClose: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tabFrame = useRef<number | null>(null);
  const [value, setValue] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const complete = value === TYPING_SOURCE;
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      if (tabFrame.current !== null)
        window.cancelAnimationFrame(tabFrame.current);
    };
  }, []);
  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, finishedAt]);
  function update(next: string) {
    const time = performance.now();
    if (startedAt === null && next.length) setStartedAt(time);
    setValue(next.slice(0, TYPING_SOURCE.length));
    setNow(time);
    setFinishedAt(next === TYPING_SOURCE ? time : null);
  }
  function insertTab(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      complete ||
      event.key !== 'Tab' ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const next =
      value.slice(0, selectionStart) + '    ' + value.slice(selectionEnd);
    update(next);
    if (tabFrame.current !== null)
      window.cancelAnimationFrame(tabFrame.current);
    tabFrame.current = window.requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(
        selectionStart + 4,
        selectionStart + 4,
      );
      tabFrame.current = null;
    });
  }
  function reset() {
    if (tabFrame.current !== null)
      window.cancelAnimationFrame(tabFrame.current);
    tabFrame.current = null;
    setValue('');
    setStartedAt(null);
    setFinishedAt(null);
    setNow(0);
    inputRef.current?.focus();
  }
  const elapsed = startedAt === null ? 0 : (finishedAt ?? now) - startedAt;
  const speed = typingSpeed(TYPING_SOURCE, value, elapsed);
  const style = {
    '--typing-top': `${Math.max(0, origin.top)}px`,
    '--typing-left': `${Math.max(0, origin.left)}px`,
    '--typing-right': `${Math.max(0, window.innerWidth - origin.left - origin.width)}px`,
    '--typing-bottom': `${Math.max(0, window.innerHeight - origin.top - origin.height)}px`,
  } as CSSProperties;
  return (
    <Modal
      aria-labelledby="typing-room-title"
      onClose={onClose}
      closeOnBackdrop={false}
    >
      <section className="egg-typing" style={style}>
        <header className="egg-typing-bar">
          <h2 id="typing-room-title">
            <InterfaceIcon name="code" />
            <span>main.cpp</span>
            <small>C++17</small>
          </h2>
          <div className="egg-typing-tools">
            {complete && <span className="egg-typing-done">완료</span>}
            <output aria-label="타수">
              <strong>{speed}</strong>
              <span>타/분</span>
            </output>
            <button type="button" aria-label="다시 시작" onClick={reset}>
              <InterfaceIcon name="refresh" />
            </button>
            <button type="button" aria-label="타이핑 닫기" onClick={onClose}>
              <InterfaceIcon name="close" />
            </button>
          </div>
        </header>
        <div className="egg-typing-sheet">
          <div className="egg-typing-gutter" aria-hidden="true">
            {TYPING_SOURCE.split('\n').map((_, index) => (
              <span key={index}>{String(index + 1).padStart(2, '0')}</span>
            ))}
          </div>
          <div className="egg-typing-surface">
            <pre className="egg-typing-reference" aria-hidden="true">
              {[...TYPING_SOURCE].map((character, index) => (
                <span
                  key={index}
                  className={
                    index < value.length
                      ? value[index] === character
                        ? 'is-correct'
                        : 'is-error'
                      : index === value.length
                        ? 'is-current'
                        : ''
                  }
                >
                  {character}
                </span>
              ))}
            </pre>
            <pre id={`${inputId}-source`} className="sr-only">
              {TYPING_SOURCE}
            </pre>
            <label className="sr-only" htmlFor={inputId}>
              코드 따라 입력
            </label>
            <textarea
              id={inputId}
              ref={inputRef}
              className="egg-typing-input"
              aria-label="코드 따라 입력"
              aria-describedby={`${inputId}-source`}
              value={value}
              onChange={(event) => update(event.target.value)}
              onKeyDown={insertTab}
              onPaste={(event) => event.preventDefault()}
              onDrop={(event) => event.preventDefault()}
              maxLength={TYPING_SOURCE.length}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              readOnly={complete}
              wrap="off"
            />
          </div>
        </div>
      </section>
    </Modal>
  );
}
