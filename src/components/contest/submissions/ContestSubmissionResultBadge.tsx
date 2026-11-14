import SubmissionScoreDetails from './SubmissionScoreDetails';
import { useEffect, useState } from 'react';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/domains/submissionScoreboard/status';
import {
  MotionNumber,
  MotionProgress,
  MotionProgressText,
  ResultTransition,
} from '@/shared/ui/ProgressMotion';
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
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
}

function ElapsedTime({ submittedAt }: { submittedAt?: string | null }) {
  const [seconds, setSeconds] = useState(() =>
    elapsedSecondsSince(submittedAt),
  );
  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds(elapsedSecondsSince(submittedAt));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [submittedAt]);
  return (
    <>
      <MotionNumber value={seconds} scope={submittedAt ?? ''} />초
    </>
  );
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
  const targetProgress = progressTarget(submission, status);
  const pending = isSubmissionPending(status);
  const scope = `${submission?.submission_id ?? submission?.submitted_at ?? ''}:${submission?.progress_total ?? ''}`;

  return (
    <div className="zoj-result-badge inline-flex max-w-full min-w-0 flex-col gap-2">
      <ResultTransition
        as="span"
        stateKey={`${status}:${submission?.progress_phase ?? ''}`}
        className={[
          'font-black decoration-1 underline-offset-2',
          toneClassNames[tone],
        ].join(' ')}
      >
        {pending && targetProgress !== null ? (
          <MotionProgressText
            text={`${label} - ${targetProgress}%`}
            scope={scope}
          />
        ) : pending ? (
          <>
            {label}{' '}
            <ElapsedTime key={scope} submittedAt={submission?.submitted_at} />
          </>
        ) : (
          label
        )}
      </ResultTransition>
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
      {targetProgress !== null ? (
        <MotionProgress
          value={targetProgress}
          scope={scope}
          label="채점 진행률"
          valueText={`${targetProgress}%`}
          className="h-1.5 w-24 bg-amber-100"
          fillClassName="bg-amber-400"
        />
      ) : null}
    </div>
  );
}
