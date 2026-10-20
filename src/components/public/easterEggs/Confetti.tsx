import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './EasterEggs.css';

const colors = [
  '#8672e8',
  '#b7a3f4',
  '#f0b785',
  '#7fbba9',
  '#e9a6bb',
  '#d9c458',
];
export default function Confetti({ onFinish }: { onFinish: () => void }) {
  const [pieces] = useState(() =>
    Array.from({ length: 76 }, (_, index) => ({
      left: `${Math.random() * 100}%`,
      drift: `${(Math.random() - 0.5) * 440}px`,
      delay: `${Math.random() * 0.45}s`,
      turn: `${(Math.random() - 0.5) * 1400}deg`,
      color: colors[index % colors.length],
      round: index % 4 === 0,
    })),
  );
  useEffect(() => {
    const timer = window.setTimeout(onFinish, 3000);
    return () => window.clearTimeout(timer);
  }, [onFinish]);
  return createPortal(
    <div className="egg-confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          style={
            {
              left: piece.left,
              background: piece.color,
              borderRadius: piece.round ? '50%' : '2px',
              '--drift': piece.drift,
              '--delay': piece.delay,
              '--turn': piece.turn,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}
