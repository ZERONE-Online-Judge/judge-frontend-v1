export const DEFAULT_PRESENTATION_ALERT_MINUTES = Object.freeze([
  30, 20, 10, 5,
]);
export const MAX_PRESENTATION_ALERT_MINUTE = 10_080;
export const MAX_PRESENTATION_ALERT_MINUTES = 32;

export type PresentationAlertMinutesConfig = {
  presentation_freeze_alert_minutes?: number[] | null;
  presentation_end_alert_minutes?: number[] | null;
};

function isAlertMinute(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PRESENTATION_ALERT_MINUTE
  );
}

function canonicalMinutes(values: number[]) {
  return [...new Set(values)].sort((first, second) => second - first);
}

/** Missing legacy values use defaults; only an explicit empty array is off. */
export function normalizePresentationAlertMinutes(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_PRESENTATION_ALERT_MINUTES];
  if (value.length === 0) return [];
  const minutes = canonicalMinutes(value.filter(isAlertMinute));
  return minutes.length
    ? minutes.slice(0, MAX_PRESENTATION_ALERT_MINUTES)
    : [...DEFAULT_PRESENTATION_ALERT_MINUTES];
}

/** Keep raw form text intact; callers save the canonical array only on success. */
export function parsePresentationAlertMinutes(raw: string): {
  minutes: number[];
  error: string | null;
} {
  if (!raw.trim()) return { minutes: [], error: null };
  const tokens = raw.split(/[\s,，、·ㆍ]+/u).filter(Boolean);
  if (
    !tokens.length ||
    tokens.some(
      (token) => !/^\d+$/u.test(token) || !isAlertMinute(Number(token)),
    )
  )
    return {
      minutes: [],
      error: '1~10,080 사이의 정수(분)만 입력해 주세요.',
    };
  const minutes = canonicalMinutes(tokens.map(Number));
  return minutes.length > MAX_PRESENTATION_ALERT_MINUTES
    ? { minutes: [], error: '알림 시점은 최대 32개까지 입력할 수 있습니다.' }
    : { minutes, error: null };
}
