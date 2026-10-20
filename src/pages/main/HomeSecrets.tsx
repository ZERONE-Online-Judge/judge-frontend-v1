import { useEffect, useRef, useState } from 'react';
import Modal from '@/shared/ui/Modal';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import './HomeSecrets.css';

import type { Secret } from './useHomeSecrets';

export default function HomeSecrets({
  secret,
  onClose,
}: {
  secret: Secret;
  onClose: () => void;
}) {
  const titles = {
    binary: '숫자 찾기',
    reaction: '반응속도',
    lights: '불 끄기',
  };
  return (
    <Modal aria-labelledby="home-secret-title" onClose={onClose}>
      <section className="home-secret-panel">
        <header>
          <div>
            <small>ZOJ / LOCAL PLAYGROUND</small>
            <h2 id="home-secret-title">{titles[secret]}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="미니게임 닫기">
            <InterfaceIcon name="close" />
          </button>
        </header>
        {secret === 'binary' ? (
          <BinaryGame />
        ) : secret === 'reaction' ? (
          <ReactionGame />
        ) : (
          <LightsGame />
        )}
        <p className="home-secret-footnote">
          브라우저에서만 실행됩니다. 실제 채점 기록에는 저장되지 않습니다.
        </p>
      </section>
    </Modal>
  );
}

function BinaryGame() {
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 1024));
  const [guesses, setGuesses] = useState<number[]>([]);
  const [input, setInput] = useState('');
  const last = guesses.at(-1);
  const solved = last === target;
  const ended = solved || guesses.length >= 10;
  const low = Math.max(
    0,
    ...guesses.filter((value) => value < target).map((value) => value + 1),
  );
  const high = Math.min(
    1023,
    ...guesses.filter((value) => value > target).map((value) => value - 1),
  );
  return (
    <div className="home-secret-game">
      <p>0부터 1023 사이의 정수를 10번 안에 찾으세요.</p>
      <div className="home-secret-readout" role="status">
        {solved
          ? `AC · ${guesses.length}번 만에 찾았습니다`
          : ended
            ? `WA · 정답은 ${target}`
            : last === undefined
              ? '범위의 중간부터 확인해 보세요.'
              : `${last}보다 ${last < target ? '큽니다' : '작습니다'}.`}
      </div>
      <p className="home-secret-metrics">
        남은 범위 {low}–{high} · 시도 {guesses.length}/10
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(input);
          if (
            !ended &&
            input.trim() &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 1023
          ) {
            setGuesses((current) => [...current, value]);
            setInput('');
          }
        }}
      >
        <label htmlFor="home-secret-number">예상 값</label>
        <div className="home-secret-form-row">
          <input
            id="home-secret-number"
            type="number"
            min={0}
            max={1023}
            step={1}
            required
            disabled={ended}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" disabled={ended}>
            확인
          </button>
        </div>
      </form>
      {ended && (
        <button
          type="button"
          onClick={() => {
            setTarget(Math.floor(Math.random() * 1024));
            setGuesses([]);
            setInput('');
          }}
        >
          다시 시작
        </button>
      )}
    </div>
  );
}

type ReactionPhase = 'idle' | 'waiting' | 'ready' | 'early' | 'done';
function ReactionGame() {
  const [phase, setPhase] = useState<ReactionPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'ready') return;
    const timer =
      phase === 'waiting'
        ? window.setTimeout(
            () => {
              startedAt.current = performance.now();
              setPhase('ready');
            },
            1500 + Math.random() * 2500,
          )
        : undefined;
    const onVisibility = () => {
      if (document.hidden) setPhase('idle');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase]);
  const labels = {
    idle: '시작',
    waiting: '기다리세요…',
    ready: '지금!',
    early: 'WA · 너무 빨랐습니다. 다시 시작',
    done: `AC · ${elapsed} ms · 다시 시작`,
  };
  return (
    <div className="home-secret-game">
      <p>시작을 누르고 기다리세요. 초록색으로 바뀌면 다시 누르세요.</p>
      <button
        className={`home-secret-reaction is-${phase}`}
        type="button"
        onClick={() => {
          if (phase === 'waiting') setPhase('early');
          else if (phase === 'ready') {
            setElapsed(
              Math.max(0, Math.round(performance.now() - startedAt.current)),
            );
            setPhase('done');
          } else setPhase('waiting');
        }}
      >
        {labels[phase]}
      </button>
      <p className="home-secret-metrics" role="status">
        {phase === 'early'
          ? '초록색으로 바뀌기 전에 눌렀습니다.'
          : phase === 'done'
            ? `반응 시간 ${elapsed} ms`
            : '소리 없이 진행됩니다.'}
      </p>
    </div>
  );
}

function toggle(board: boolean[], cell: number) {
  const row = Math.floor(cell / 3),
    column = cell % 3;
  return board.map((on, index) =>
    Math.abs(Math.floor(index / 3) - row) + Math.abs((index % 3) - column) <= 1
      ? !on
      : on,
  );
}
function newBoard() {
  // Start from a solved board and make legal moves; every board is solvable.
  return [0, 2, 4, 7].reduce(
    (board, cell) => toggle(board, cell),
    Array<boolean>(9).fill(false),
  );
}
function LightsGame() {
  const [board, setBoard] = useState(newBoard);
  const [moves, setMoves] = useState(0);
  const solved = board.every((on) => !on);
  return (
    <div className="home-secret-game">
      <p>불을 모두 끄세요. 누른 칸과 상하좌우의 상태가 바뀝니다.</p>
      <div
        className="home-secret-lights"
        role="group"
        aria-label="불 끄기 보드"
      >
        {board.map((on, index) => (
          <button
            key={index}
            type="button"
            aria-label={`${Math.floor(index / 3) + 1}행 ${(index % 3) + 1}열`}
            aria-pressed={on}
            disabled={solved}
            onClick={() => {
              setBoard((current) => toggle(current, index));
              setMoves((current) => current + 1);
            }}
          >
            <span aria-hidden="true">{on ? '1' : '0'}</span>
          </button>
        ))}
      </div>
      <p className="home-secret-readout" role="status">
        {solved ? `AC · ${moves}번 만에 완료` : `이동 ${moves}회`}
      </p>
      <button
        type="button"
        onClick={() => {
          setBoard(newBoard());
          setMoves(0);
        }}
      >
        다시 시작
      </button>
    </div>
  );
}
