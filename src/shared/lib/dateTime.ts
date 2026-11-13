export function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatRelativeTime(value?: string, now = Date.now()) {
  if (!value) return '-';

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return '-';
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}초 전`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  return `${Math.floor(diffHours / 24)}일 전`;
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function dateTimeLocalValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateTimeLocalToIso(value: string) {
  return new Date(value).toISOString();
}

export function formatTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatContestMoment(value?: string | null) {
  if (!value) return '-';

  const date = new Date(value);
  const now = new Date();
  const time = formatTime(value);

  if (isSameLocalDay(date, now)) return time;

  const day = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  })
    .format(date)
    .replace(/\s/g, '');
  return `${day} ${time}`;
}

export function timeLeft(endAt: string) {
  const diff = Math.max(0, new Date(endAt).getTime() - Date.now());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}
