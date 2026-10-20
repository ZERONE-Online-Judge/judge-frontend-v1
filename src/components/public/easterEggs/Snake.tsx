import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import Modal from '@/shared/ui/Modal';
import type { EggOrigin } from './context';
import {
  advanceSnake,
  createSnake,
  turnSnake,
  type Direction,
} from './snakeEngine';
import './Snake.css';

const keys: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  w: 'up',
  d: 'right',
  s: 'down',
  a: 'left',
};
function subscribeViewport(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}
function viewportSize() {
  return `${window.innerWidth}:${window.innerHeight}`;
}

export default function Snake({
  origin,
  onClose,
}: {
  origin: EggOrigin;
  onClose: () => void;
}) {
  const viewport = useSyncExternalStore(
    subscribeViewport,
    viewportSize,
    () => '1024:768',
  );
  const [width, height] = viewport.split(':').map(Number);
  return (
    <Modal aria-label="지렁이" onClose={onClose} closeOnBackdrop={false}>
      <SnakeRound
        key={viewport}
        origin={origin}
        width={width}
        height={height}
        onClose={onClose}
      />
    </Modal>
  );
}

function SnakeRound({
  origin,
  width,
  height,
  onClose,
}: {
  origin: EggOrigin;
  width: number;
  height: number;
  onClose: () => void;
}) {
  const [game, setGame] = useState(() => createSnake(origin, width, height));
  const [round, setRound] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const ended = game.phase === 'over' || game.phase === 'won';
  const paused = game.phase === 'paused';
  function restart() {
    setGame(createSnake(origin, width, height));
    setRound((n) => n + 1);
  }
  function togglePause() {
    setGame((current) => ({
      ...current,
      phase:
        current.phase === 'paused'
          ? 'running'
          : current.phase === 'ready' || current.phase === 'running'
            ? 'paused'
            : current.phase,
    }));
  }
  useEffect(() => {
    if (game.phase !== 'ready') return;
    const timer = window.setTimeout(
      () =>
        setGame((current) =>
          current.phase === 'ready'
            ? { ...current, phase: 'running' }
            : current,
        ),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [game.phase, round]);
  useEffect(() => {
    if (game.phase !== 'running') return;
    const timer = window.setInterval(
      () => setGame((current) => advanceSnake(current)),
      140,
    );
    return () => window.clearInterval(timer);
  }, [game.phase]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        setGame((current) => turnSnake(current, direction));
      } else if (
        event.code === 'Space' &&
        event.target === document.activeElement &&
        !(event.target instanceof window.HTMLButtonElement)
      ) {
        event.preventDefault();
        setGame((current) => ({
          ...current,
          phase:
            current.phase === 'paused'
              ? 'running'
              : current.phase === 'running' || current.phase === 'ready'
                ? 'paused'
                : current.phase,
        }));
      }
    };
    const visibility = () => {
      if (document.hidden)
        setGame((current) =>
          current.phase === 'running' || current.phase === 'ready'
            ? { ...current, phase: 'paused' }
            : current,
        );
    };
    window.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  function pointerDown(event: PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    gesture.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerUp(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'right'
          : 'left'
        : dy > 0
          ? 'down'
          : 'up';
    setGame((current) => turnSnake(current, direction));
  }
  const { arena } = game;
  return (
    <section
      className={`egg-snake ${ended ? 'is-ended' : ''}`}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        gesture.current = null;
      }}
    >
      <div className="snake-toolbar">
        <output aria-label="지렁이 길이">
          <i aria-hidden="true" />
          <strong>{game.body.length}</strong>
        </output>
        <div>
          <button
            type="button"
            aria-label={paused ? '지렁이 계속하기' : '지렁이 일시정지'}
            onClick={togglePause}
            disabled={ended}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              {paused ? (
                <path d="m8 5 11 7-11 7Z" />
              ) : (
                <path d="M7 5h3v14H7zm7 0h3v14h-3z" />
              )}
            </svg>
          </button>
          <button type="button" aria-label="지렁이 다시 시작" onClick={restart}>
            <InterfaceIcon name="refresh" />
          </button>
          <button type="button" aria-label="지렁이 닫기" onClick={onClose}>
            <InterfaceIcon name="close" />
          </button>
        </div>
      </div>
      <div
        className="snake-field"
        aria-hidden="true"
        style={
          {
            left: arena.left,
            top: arena.top,
            width: arena.columns * arena.cell,
            height: arena.rows * arena.cell,
            '--snake-cell': `${arena.cell}px`,
          } as CSSProperties
        }
      >
        {game.food && (
          <i
            className="snake-food"
            style={{
              left: game.food.x * arena.cell,
              top: game.food.y * arena.cell,
            }}
          />
        )}
        {game.body.map((cell, index) => (
          <i
            key={`${round}:${index}`}
            className={`snake-segment ${index === 0 ? `is-head faces-${game.direction}` : ''}`}
            style={{
              transform: `translate(${cell.x * arena.cell}px, ${cell.y * arena.cell}px)`,
              opacity: index === 0 ? 1 : Math.max(0.5, 1 - index * 0.025),
            }}
          />
        ))}
      </div>
      {(paused || ended) && (
        <div className="snake-return">
          <button type="button" onClick={ended ? restart : togglePause}>
            <InterfaceIcon name={ended ? 'refresh' : 'arrowRight'} />
            {ended ? '다시 하기' : '계속하기'}
          </button>
        </div>
      )}
      <div className="snake-direction-pad" aria-label="지렁이 방향">
        {(['up', 'left', 'down', 'right'] as const).map((direction) => (
          <button
            type="button"
            key={direction}
            className={`points-${direction}`}
            aria-label={
              {
                up: '위로',
                left: '왼쪽으로',
                down: '아래로',
                right: '오른쪽으로',
              }[direction]
            }
            disabled={paused || ended}
            onClick={() => setGame((current) => turnSnake(current, direction))}
          >
            <InterfaceIcon name="arrowRight" />
          </button>
        ))}
      </div>
    </section>
  );
}
