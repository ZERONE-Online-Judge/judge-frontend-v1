function scoreboardUpdateKey(contestId: string) {
  return `zoj.scoreboard.updated.${contestId}`;
}

export function notifyScoreboardUpdate(contestId: string) {
  window.dispatchEvent(new window.Event(scoreboardUpdateKey(contestId)));
  try {
    const channel = new window.BroadcastChannel(scoreboardUpdateKey(contestId));
    channel.postMessage('updated');
    channel.close();
  } catch {
    // Older browsers still receive the storage signal or the server stream.
  }
  try {
    // Only signal a refresh; each display fetches its own authorized data.
    window.localStorage.setItem(
      scoreboardUpdateKey(contestId),
      `${Date.now()}:${Math.random()}`,
    );
  } catch {
    // Presentation polling still works when browser storage is unavailable.
  }
}

export function subscribeScoreboardUpdates(
  contestId: string,
  onUpdate: () => void,
  options?: {
    token: string;
    displayOnly: boolean;
    onConnectionChange: (connected: boolean) => void;
  },
) {
  let stopped = false;
  let controller: AbortController | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 500;
  let channel: BroadcastChannel | undefined;
  try {
    channel = new window.BroadcastChannel(scoreboardUpdateKey(contestId));
    channel.onmessage = (event) => {
      if (event.data === 'updated') onUpdate();
    };
  } catch {
    // BroadcastChannel is an optimization; it never carries private rows.
  }
  function handleStorage(event: StorageEvent) {
    if (event.key === scoreboardUpdateKey(contestId) && event.newValue) {
      onUpdate();
    }
  }

  async function connect() {
    if (!options || typeof window.fetch !== 'function' || stopped) return;
    controller?.abort();
    const attempt = new AbortController();
    controller = attempt;
    const path = options.displayOnly
      ? `/presentation/contests/${encodeURIComponent(contestId)}/scoreboard/events`
      : `/operator/contests/${encodeURIComponent(contestId)}/scoreboard/presentation/events`;
    try {
      const response = await window.fetch(`${API_BASE_URL}${path}`, {
        headers: {
          authorization: `Bearer ${options.token}`,
          accept: 'text/event-stream',
        },
        credentials: 'include',
        cache: 'no-store',
        signal: attempt.signal,
      });
      if (stopped || attempt.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        onUpdate();
        return;
      }
      if (!response.ok || !response.body)
        throw new Error('Presentation stream unavailable');
      options.onConnectionChange(true);
      retryDelay = 500;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!stopped && !attempt.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(
            /\r\n/g,
            '\n',
          );
          if (buffer.length > 65536)
            throw new Error('Invalid presentation event');
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const lines = frame.split('\n').map((line) => line.trim());
            if (
              lines.includes('event: scoreboard_update') ||
              lines.includes('event: reauthenticate')
            ) {
              if (!stopped && !attempt.signal.aborted) onUpdate();
            }
            if (lines.includes('event: reauthenticate')) return;
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch {
      // A disconnected stream falls back to polling and reconnects automatically.
    } finally {
      if (!stopped && !attempt.signal.aborted && controller === attempt) {
        options.onConnectionChange(false);
        retryTimer = setTimeout(() => void connect(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
      }
    }
  }
  function reconnect() {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(retryTimer);
    onUpdate();
    void connect();
  }
  window.addEventListener(scoreboardUpdateKey(contestId), onUpdate);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', reconnect);
  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
    channel?.close();
    window.removeEventListener(scoreboardUpdateKey(contestId), onUpdate);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('online', reconnect);
    document.removeEventListener('visibilitychange', reconnect);
  };
}
import { API_BASE_URL } from '@/shared/api/client';
