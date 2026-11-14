import { useSyncExternalStore } from 'react';

// Every visible session timestamp shares one clock, even in long team lists.
const subscribers = new Set<() => void>();
let now = Date.now();
let timer: number | undefined;

function update() {
  now = Date.now();
  subscribers.forEach((notify) => notify());
}

function updateVisibility() {
  window.clearInterval(timer);
  timer = undefined;
  if (!document.hidden) {
    update();
    timer = window.setInterval(update, 30_000);
  }
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  if (subscribers.size === 1) {
    now = Date.now();
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
  }
  return () => {
    subscribers.delete(notify);
    if (!subscribers.size) {
      window.clearInterval(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', updateVisibility);
    }
  };
}

export default function useSessionActivityClock() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
