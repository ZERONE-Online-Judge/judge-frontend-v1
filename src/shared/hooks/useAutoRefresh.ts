import { useEffect, useState } from 'react';

export function useCooldown(cooldownUntil: number) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setRemainingSeconds(
        Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)),
      );
    };
    const firstTick = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);

    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [cooldownUntil]);

  return remainingSeconds;
}

export function useClockTick(intervalMs = 1000) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const firstTick = window.setTimeout(update, 0);
    const timer = window.setInterval(update, intervalMs);

    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

export function useAutoRefresh(
  refresh: (() => Promise<void>) | (() => void),
  enabled = true,
  intervalMs = 15_000,
) {
  useEffect(() => {
    if (!enabled) return;

    let pending = false;

    async function runRefresh() {
      if (pending) return;
      pending = true;
      try {
        await refresh();
      } finally {
        pending = false;
      }
    }

    const timer = window.setInterval(() => {
      void runRefresh();
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh, enabled, intervalMs]);
}
