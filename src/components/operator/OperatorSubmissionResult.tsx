import type { Submission } from '@/domains/submissionScoreboard/types';
import {
  isSubmissionPending,
  submissionStatusLabel,
} from '@/domains/submissionScoreboard/status';
import SubmissionStatusBadge from '@/shared/ui/SubmissionStatusBadge';

export default function OperatorSubmissionResult({
  submission,
}: {
  submission: Submission;
}) {
  const candidate = submission.rejudging_progress;
  if (candidate && isSubmissionPending(candidate.status)) {
    return (
      <div className="grid gap-1.5">
        <span className="text-xs font-semibold text-indigo-700">재채점 중</span>
        <SubmissionStatusBadge
          submission={{
            ...submission,
            ...candidate,
            score: null,
            subtask_results: [],
          }}
        />
        <span className="text-xs text-slate-500">
          기존 결과 · {submissionStatusLabel(submission.status)}
        </span>
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <SubmissionStatusBadge submission={submission} />
      {candidate || submission.rejudged ? (
        <span className="text-xs font-medium text-slate-500">
          {candidate
            ? candidate.batch_status === 'blocked' ||
              candidate.status === 'system_error'
              ? '재채점 오류'
              : candidate.batch_status === 'ready'
                ? '반영 대기'
                : '재채점 완료'
            : '재채점됨'}
        </span>
      ) : null}
    </div>
  );
}
