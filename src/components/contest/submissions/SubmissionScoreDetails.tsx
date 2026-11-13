import type { Submission } from '@/domains/submissionScoreboard/types';
import {
  formatScore,
  isIoiScoring,
  submissionScoreLabel,
} from '@/domains/submissionScoreboard/scoring';
import {
  isSubmissionPending,
  submissionStatusLabel,
} from '@/domains/submissionScoreboard/status';

export default function SubmissionScoreDetails({
  submission,
  compact = false,
}: {
  submission: Pick<
    Submission,
    'scoring_mode' | 'score' | 'max_score' | 'status' | 'subtask_results'
  >;
  compact?: boolean;
}) {
  if (
    !isIoiScoring(submission.scoring_mode) ||
    isSubmissionPending(submission.status)
  )
    return null;
  const groups = submission.subtask_results ?? [];
  return (
    <div className="grid min-w-0 gap-2" aria-label="제출 점수">
      <strong
        className={`tabular-nums ${compact ? 'text-sm' : 'text-xl'} ${submission.score == null ? 'text-slate-500' : submission.score === submission.max_score ? 'text-emerald-700' : 'text-indigo-700'}`}
      >
        {submissionScoreLabel(submission)}
      </strong>
      {submission.score == null ? (
        <p className="text-xs leading-5 text-slate-500">
          채점이 완료되지 않아 공식 점수에 반영되지 않았습니다.
        </p>
      ) : null}
      {groups.length ? (
        <details className="min-w-0 text-xs text-slate-600">
          <summary className="w-fit cursor-pointer py-1 font-medium">
            서브태스크별 점수
          </summary>
          <ul className="mt-2 grid gap-2">
            {groups.map((group) => (
              <li
                key={group.subtask_id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <span className="min-w-0 font-medium break-words">
                  {group.name}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  <strong
                    className={
                      group.score === group.max_score
                        ? 'text-emerald-700'
                        : 'text-slate-700'
                    }
                  >
                    {formatScore(group.score)} / {formatScore(group.max_score)}
                    점
                  </strong>
                  <span>
                    {submissionStatusLabel(group.status)}
                    {group.failed_testcase_order != null
                      ? ` · #${group.failed_testcase_order}`
                      : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!compact && submission.score != null ? (
        <p className="text-xs leading-5 text-slate-500">
          이 제출의 점수입니다. 대회 성적은 서브태스크별 최고점을 여러 제출에서
          모아 계산합니다.
        </p>
      ) : null}
    </div>
  );
}
