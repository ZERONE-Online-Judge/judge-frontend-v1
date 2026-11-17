import {
  fetchFrontendVersion,
  type FrontendVersion,
} from '@/shared/lib/frontendVersion';

type MonitorOptions = {
  currentVersion: string;
  isBlocked: () => boolean;
  onVersion: (version: FrontendVersion | null) => void;
  onAutoReload: (version: FrontendVersion) => void;
};

/** One monitor per document; failures never navigate or disturb the current app. */
export function startFrontendVersionMonitor(options: MonitorOptions) {
  let stopped = false;
  let inFlight: Promise<FrontendVersion | null> | null = null;
  let controller: AbortController | null = null;
  let candidate: FrontendVersion | null = null;
  let confirmations = 0;
  let confirmedAt = 0;
  let safeSince = 0;
  let lastCheck = 0;
  let confirmationTimer: ReturnType<typeof setTimeout> | undefined;

  const available = () =>
    !stopped &&
    document.visibilityState === 'visible' &&
    navigator.onLine !== false;

  function check(force = false): Promise<FrontendVersion | null> {
    if (!available()) return Promise.resolve(null);
    if (inFlight) return inFlight;
    if (!force && Date.now() - lastCheck < 5_000) return Promise.resolve(null);
    lastCheck = Date.now();
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 8_000);
    inFlight = fetchFrontendVersion(controller.signal)
      .then((version) => {
        if (stopped) return null;
        if (!version) {
          confirmations = 0;
          return null;
        }
        if (version.version === options.currentVersion) {
          candidate = null;
          confirmations = 0;
          options.onVersion(null);
          return version;
        }
        confirmations =
          candidate?.version === version.version ? confirmations + 1 : 1;
        candidate = version;
        confirmedAt = Date.now();
        safeSince = 0;
        options.onVersion(version);
        if (confirmations === 1) {
          clearTimeout(confirmationTimer);
          confirmationTimer = setTimeout(() => {
            void check(true);
          }, 3_000);
        }
        return version;
      })
      .catch(() => {
        confirmations = 0;
        return null;
      })
      .finally(() => {
        clearTimeout(timeout);
        controller = null;
        inFlight = null;
      });
    return inFlight;
  }

  const resume = () => {
    void check();
  };
  const initial = setTimeout(() => {
    void check(true);
  }, 1_000);
  const poll = setInterval(resume, 60_000);
  const idle = setInterval(() => {
    if (
      !available() ||
      !candidate ||
      confirmations < 2 ||
      options.isBlocked()
    ) {
      safeSince = 0;
      return;
    }
    // A confirmation obtained before a long edit/hidden period is no longer fresh.
    if (Date.now() - confirmedAt > 10_000) {
      safeSince = 0;
      void check();
      return;
    }
    if (!safeSince) safeSince = Date.now();
    if (Date.now() - safeSince < 2_000) return;
    // Read the safety gate again immediately before the synchronous navigation.
    if (options.isBlocked()) return;
    const target = candidate;
    candidate = null;
    options.onAutoReload(target);
  }, 500);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  return {
    check: () => check(true),
    stop() {
      stopped = true;
      controller?.abort();
      clearTimeout(initial);
      clearTimeout(confirmationTimer);
      clearInterval(poll);
      clearInterval(idle);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
    },
  };
}
