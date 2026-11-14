import { isSubmissionPending } from './status';
import type { Submission } from './types';

export function needsSubmissionLiveUpdate(submission: Submission) {
  return (
    isSubmissionPending(submission.status) ||
    isSubmissionPending(submission.rejudging_progress?.status)
  );
}

/** Keep page membership, source, labels and counts owned by the list query. */
export function mergeSubmissionUpdates(
  submissions: Submission[],
  updates: Submission[] = [],
) {
  const byId = new Map(updates.map((item) => [item.submission_id, item]));
  return submissions.map((submission) => {
    const update = byId.get(submission.submission_id);
    if (!update) return submission;
    return {
      ...submission,
      ...update,
      source_code: submission.source_code,
    };
  });
}
