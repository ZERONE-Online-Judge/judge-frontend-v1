import { submissionScoreLabel } from '@/domains/submissionScoreboard/scoring';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionProgressText,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/domains/submissionScoreboard/status';
import type { SubmissionProgressState } from '@/domains/submissionScoreboard/types';

type SubmissionStatusBadgeProps = {
  submission?: SubmissionProgressState | null;
  compact?: boolean;
};

const toneClasses: Record<string, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  waiting: 'border-amber-200 bg-amber-50 text-amber-700',
  judging: 'border-amber-200 bg-amber-50 text-amber-700',
  runtime: 'border-purple-200 bg-purple-50 text-purple-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
};

const progressClasses: Record<string, string> = {
  success: 'bg-emerald-500',
  waiting: 'bg-amber-400',
  judging: 'bg-amber-400',
  runtime: 'bg-purple-500',
  danger: 'bg-red-500',
  neutral: 'bg-slate-400',
};

export default function SubmissionStatusBadge({
  submission,
  compact = false,
}: SubmissionStatusBadgeProps) {
  const status = submission?.status;
  const tone = submissionStatusTone(status);
  const pending = isSubmissionPending(status);
  const progressText = submissionProgressText(submission);
  const progressPercent = submissionProgressPercent(submission) ?? 0;
  const scoreLabel = submission ? submissionScoreLabel(submission) : null;

  return (
    <span
      className={
        scoreLabel
          ? 'inline-flex min-w-0 flex-col items-start gap-2'
          : compact
            ? 'inline-flex items-center gap-2'
            : 'inline-flex min-w-0 flex-wrap items-center gap-3'
      }
    >
      <span
        className={[
          'inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-bold break-keep',
          toneClasses[tone],
        ].join(' ')}
      >
        {submissionStatusLabel(status)}
      </span>
      {scoreLabel ? (
        <strong className="text-xs font-semibold whitespace-nowrap text-indigo-700 tabular-nums">
          {scoreLabel}
        </strong>
      ) : null}
      {pending && progressText && !compact && (
        <span className="grid min-w-24 gap-1">
          <span className="text-xs font-medium text-slate-500">
            {progressText}
          </span>
          <span
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
            aria-hidden="true"
          >
            <span
              className={[
                'block h-full rounded-full',
                progressClasses[tone],
              ].join(' ')}
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        </span>
      )}
    </span>
  );
}
