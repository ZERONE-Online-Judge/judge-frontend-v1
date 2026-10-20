import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  PublicEggContext,
  isPublicEggPath,
  type EggOrigin,
  type EggPoint,
} from './context';
import CodeTyping from './CodeTyping';
import Spotlight from './Spotlight';
import Confetti from './Confetti';

const pointerQuery =
  '(min-width: 769px) and (hover: hover) and (pointer: fine)';
function subscribePointer(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(pointerQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function finePointer() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(pointerQuery).matches
  );
}

export default function PublicEasterEggs({
  children,
}: {
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const enabled = isPublicEggPath(pathname);
  const desktopPointer = useSyncExternalStore(
    subscribePointer,
    finePointer,
    () => false,
  );
  const [typing, setTyping] = useState<{
    origin: EggOrigin;
    path: string;
  } | null>(null);
  const [spotlight, setSpotlight] = useState<EggPoint | null>(null);
  const [celebration, setCelebration] = useState(0);
  const [confettiVisible, setConfettiVisible] = useState(false);
  const starTaps = useRef(0);
  const finishConfetti = useCallback(() => setConfettiVisible(false), []);
  return (
    <PublicEggContext.Provider
      value={{
        openTyping: (origin) => {
          if (enabled) setTyping({ origin, path: pathname });
        },
        tapSpotlight: (point) => {
          if (!enabled || !desktopPointer || spotlight) return;
          starTaps.current += 1;
          if (starTaps.current >= 3) setSpotlight(point);
        },
        celebrate: () => {
          if (enabled) {
            setCelebration((current) => current + 1);
            setConfettiVisible(true);
          }
        },
      }}
    >
      {children}
      {enabled && typing?.path === pathname && (
        <CodeTyping origin={typing.origin} onClose={() => setTyping(null)} />
      )}
      {enabled && spotlight && desktopPointer && (
        <Spotlight point={spotlight} />
      )}
      {enabled && confettiVisible && (
        <Confetti key={celebration} onFinish={finishConfetti} />
      )}
    </PublicEggContext.Provider>
  );
}
