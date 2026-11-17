export type FrontendUpdateBlockerKind = 'draft' | 'operation';

const blockers = new Map<symbol, FrontendUpdateBlockerKind>();
const listeners = new Set<() => void>();
let snapshot = { drafts: 0, operations: 0, changedAt: Date.now() };

function publish() {
  snapshot = {
    drafts: [...blockers.values()].filter((kind) => kind === 'draft').length,
    operations: [...blockers.values()].filter((kind) => kind === 'operation')
      .length,
    changedAt: Date.now(),
  };
  listeners.forEach((listener) => listener());
}

/** Reference counted so nested requests and StrictMode cleanup cannot unlock a peer. */
export function acquireFrontendUpdateBlocker(
  kind: FrontendUpdateBlockerKind = 'draft',
) {
  const key = Symbol();
  blockers.set(key, kind);
  publish();
  return () => {
    if (blockers.delete(key)) publish();
  };
}

export function subscribeFrontendUpdateSafety(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFrontendUpdateSafety() {
  return snapshot;
}

export function protectFrontendWrite(init?: RequestInit) {
  return /^(GET|HEAD|OPTIONS)$/i.test(init?.method ?? 'GET')
    ? () => {}
    : acquireFrontendUpdateBlocker('operation');
}
