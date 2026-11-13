const RECENT_SUBMISSION_WINDOW_MS = 60_000;

export function isRecentSubmission(
  submittedAt?: string | null,
  now = Date.now(),
) {
  if (!submittedAt || !Number.isFinite(now)) return false;
  const timestamp = new Date(submittedAt).getTime();
  const age = now - timestamp;
  return (
    Number.isFinite(timestamp) && age >= 0 && age < RECENT_SUBMISSION_WINDOW_MS
  );
}
