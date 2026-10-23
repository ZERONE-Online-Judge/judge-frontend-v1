/** Coalesce refresh signals without aborting a snapshot that is already loading.
 * A signal that joins an older poll always schedules one fresh read afterward.
 */
export function queuedPresentationRefresh(
  refresh: () => Promise<unknown>,
  isFetching: () => boolean,
) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run() {
    timer = undefined;
    if (stopped || running) return;
    running = true;
    try {
      while (pending && !stopped) {
        pending = false;
        const joinedExisting = isFetching();
        try {
          await refresh();
        } catch {
          // The query displays errors and normal polling remains available.
        }
        if (joinedExisting) pending = true;
      }
    } finally {
      running = false;
    }
  }
  return {
    request() {
      if (stopped) return;
      pending = true;
      if (!running && !timer) timer = setTimeout(() => void run(), 16);
    },
    stop() {
      stopped = true;
      pending = false;
      clearTimeout(timer);
    },
  };
}
