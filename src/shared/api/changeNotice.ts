export type ChangeNoticeDraft = {
  title: string;
  body: string;
  fingerprint: string;
  reason?: string;
};

export type ChangeNoticeApproval = ChangeNoticeDraft & { reason: string };
export type SavedChangeNotice = {
  contest_notice_id: string;
  contest_id: string;
  title: string;
  body: string;
  published_at: string;
};
let saved: { identity: string; notice: SavedChangeNotice } | null = null;
type PendingChange = {
  id: number;
  draft: ChangeNoticeDraft;
  resolve: (value: ChangeNoticeApproval | null) => void;
};
let nextId = 0;
let pending: PendingChange[] = [];
const listeners = new Set<() => void>();

export function subscribeChangeNotice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function currentChangeNotice() {
  return pending[0] ?? null;
}
export function currentSavedChangeNotice() {
  return saved;
}
export function recordSavedChangeNotice(
  identity: string,
  notice: SavedChangeNotice,
) {
  saved = { identity, notice };
  listeners.forEach((listener) => listener());
}
export function changeNoticeBody(body: string, reason: string) {
  return body.trim() + (reason.trim() ? `\n\n변경 사유: ${reason.trim()}` : '');
}
export function requestChangeNotice(draft: ChangeNoticeDraft) {
  return new Promise<ChangeNoticeApproval | null>((resolve) => {
    pending = [...pending, { id: ++nextId, draft, resolve }];
    listeners.forEach((listener) => listener());
  });
}
export function finishChangeNotice(
  id: number,
  value: ChangeNoticeApproval | null,
) {
  const request = pending.find((item) => item.id === id);
  if (!request) return;
  pending = pending.filter((item) => item.id !== id);
  listeners.forEach((listener) => listener());
  request.resolve(value);
}

export function changeNoticeRequestInit(
  init: RequestInit | undefined,
  approval: ChangeNoticeApproval,
): RequestInit {
  if (init?.body instanceof FormData) {
    const body = new FormData();
    init.body.forEach((value, key) => {
      if (key !== '_change_notice') body.append(key, value);
    });
    body.set('_change_notice', JSON.stringify(approval));
    return { ...init, body };
  }
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  return {
    ...init,
    body: JSON.stringify({ ...body, _change_notice: approval }),
  };
}
