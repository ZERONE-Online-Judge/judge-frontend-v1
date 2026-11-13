const RECENT_SUBMISSION_WINDOW_MS = 60_000;

export function submissionRecencyStrength(
  submittedAt?: string | null,
  now = Date.now(),
) {
  if (!submittedAt || !Number.isFinite(now)) return 0;
  const timestamp = new Date(submittedAt).getTime();
  const age = now - timestamp;
  if (
    !Number.isFinite(timestamp) ||
    age < 0 ||
    age >= RECENT_SUBMISSION_WINDOW_MS
  )
    return 0;
  return 1 - age / RECENT_SUBMISSION_WINDOW_MS;
}

export function isRecentSubmission(
  submittedAt?: string | null,
  now = Date.now(),
) {
  return submissionRecencyStrength(submittedAt, now) > 0;
}
