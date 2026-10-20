import { useEffect, useRef, useState } from 'react';

export type Secret = 'binary' | 'reaction' | 'lights';
const sequence = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
];

export function useHomeSecrets() {
  const [secret, setSecret] = useState<Secret | null>(null);
  const taps = useRef<Record<string, { count: number; at: number }>>({});

  useEffect(() => {
    if (secret) return;
    let keys: string[] = [];
    let lastKeyAt = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
          )) ||
        document.querySelector('dialog[open], [aria-modal="true"]')
      ) {
        keys = [];
        return;
      }
      const now = Date.now();
      if (now - lastKeyAt > 2000) keys = [];
      lastKeyAt = now;
      keys = [...keys, event.key.toLowerCase()].slice(-sequence.length);
      if (
        keys.length === sequence.length &&
        keys.every((key, index) => key === sequence[index])
      ) {
        setSecret('lights');
        taps.current = {};
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [secret]);

  function tap(name: Secret) {
    if (secret || document.querySelector('dialog[open], [aria-modal="true"]'))
      return;
    const now = Date.now();
    const previous = taps.current[name];
    const count = previous && now - previous.at < 4000 ? previous.count + 1 : 1;
    taps.current[name] = { count, at: now };
    const required = { binary: 7, reaction: 5, lights: 9 }[name];
    if (count >= required) {
      taps.current = {};
      setSecret(name);
    }
  }

  return { secret, tap, close: () => setSecret(null) };
}
