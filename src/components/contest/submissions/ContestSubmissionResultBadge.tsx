import SubmissionScoreDetails from './SubmissionScoreDetails';
import { useEffect, useMemo, useState } from 'react';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/domains/submissionScoreboard/status';
import type { SubmissionProgressState } from '@/domains/submissionScoreboard/types';

type ContestSubmissionResultBadgeProps = {
  judgeMessage?: string | null;
  submission?: SubmissionProgressState;
  status: string;
};

const toneClassNames = {
  success: 'text-emerald-600 no-underline',
  waiting: 'text-amber-600 no-underline',
  judging: 'text-amber-600 no-underline',
  runtime: 'text-purple-700 no-underline',
  danger: 'text-red-500 no-underline',
  neutral: 'text-slate-950 underline decoration-current',
} as const;

function progressTarget(
  submission: SubmissionProgressState | undefined,
  status: string,
) {
  if (status !== 'judging') return null;

  const percent = submissionProgressPercent(submission ?? { status });
  if (percent !== null) return percent;

  return null;
}

function elapsedSecondsSince(value?: string | null) {
  if (!value) return 0;
  const elapsed = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  return Math.max(0, elapsed);
}

export default function ContestSubmissionResultBadge({
  judgeMessage,
  submission,
  status,
}: ContestSubmissionResultBadgeProps) {
  const tone = submissionStatusTone(status);
  const label =
    status === 'judging' && submission?.progress_phase === 'tle_confirmation'
      ? '시간 초과 재확인 중'
      : submissionStatusLabel(status);
  const detail = judgeMessage?.trim();
  const targetProgress = useMemo(
    () => progressTarget(submission, status),
    [
      status,
      submission?.progress_current,
      submission?.progress_percent,
      submission?.progress_total,
    ],
  );
  const [displayProgress, setDisplayProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    elapsedSecondsSince(submission?.submitted_at),
  );
  const visibleProgress =
    status === 'judging' && targetProgress !== null
      ? Math.max(
          0,
          Math.min(
            99,
            Math.round(
              submission?.progress_phase === 'tle_confirmation'
                ? targetProgress
                : displayProgress,
            ),
          ),
        )
      : null;
  const shouldShowElapsed =
    isSubmissionPending(status) && visibleProgress === null;
  const displayLabel =
    isSubmissionPending(status) && visibleProgress !== null
      ? `${label} - ${visibleProgress}%`
      : shouldShowElapsed
        ? `${label} ${elapsedSeconds}초`
        : label;

  useEffect(() => {
    if (targetProgress === null) {
      setDisplayProgress(0);
      return;
    }

    setDisplayProgress((previous) => Math.min(previous, targetProgress));
    const interval = window.setInterval(() => {
      setDisplayProgress((previous) => {
        const diff = targetProgress - previous;
        if (Math.abs(diff) < 0.4) {
          if (status === 'judging' && targetProgress < 95) {
            return Math.min(95, previous + 0.08);
          }

          return targetProgress;
        }

        const step = Math.max(0.35, Math.abs(diff) * 0.16);
        return previous + Math.sign(diff) * step;
      });
    }, 80);

    return () => window.clearInterval(interval);
  }, [status, targetProgress]);

  useEffect(() => {
    if (!isSubmissionPending(status)) return;

    setElapsedSeconds(elapsedSecondsSince(submission?.submitted_at));
    const interval = window.setInterval(() => {
      setElapsedSeconds(elapsedSecondsSince(submission?.submitted_at));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [status, submission?.submitted_at]);

  return (
    <div className="zoj-result-badge inline-flex max-w-full min-w-0 flex-col gap-2">
      <span
        className={[
          'font-black decoration-1 underline-offset-2',
          toneClassNames[tone],
        ].join(' ')}
      >
        {displayLabel}
      </span>
      {submission ? (
        <SubmissionScoreDetails submission={submission} compact />
      ) : null}
      {detail ? (
        <details className="zoj-judge-detail max-w-full text-xs font-normal text-slate-500">
          <summary className="cursor-pointer py-1 text-slate-500">
            채점 메시지 보기
          </summary>
          <pre className="mt-2 max-h-48 max-w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-slate-700">
            {detail}
          </pre>
        </details>
      ) : null}
      {visibleProgress !== null ? (
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-amber-100">
          <span
            className="block h-full rounded-full bg-amber-400 transition-[width] duration-200 ease-out"
            style={{ width: `${visibleProgress}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}
