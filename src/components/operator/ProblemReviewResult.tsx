import BoundedText from '@/shared/ui/BoundedText';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import type { ProblemReviewRun } from '@/domains/problemManagement/useProblemReviewRuns';
import { parseVerificationDetails } from '@/domains/problemManagement/verificationDetails';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionProgressText,
  submissionStatusLabel,
} from '@/domains/submissionScoreboard/status';
import { formatMemoryKb } from '@/shared/lib/formatters';

export default function ProblemReviewResult({
  run,
  onResume,
}: {
  run: ProblemReviewRun;
  onResume: () => void;
}) {
  const submission = run.submission;
  const detail = parseVerificationDetails(submission?.judge_message);
  const pending = run.phase === 'submitting' || run.phase === 'judging';
  const percent = submissionProgressPercent(submission);
  const label =
    run.phase === 'error'
      ? '요청 오류'
      : run.phase === 'submitting'
        ? '제출 중'
        : submissionStatusLabel(submission?.status);
  const tone = pending
    ? 'bg-indigo-50 text-indigo-700'
    : submission?.status === 'accepted' && !run.error
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-800';

  return (
    <section
      aria-label="검수 채점 결과"
      className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">채점 결과</h3>
        <span
          role="status"
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}
        >
          {label}
        </span>
      </div>
      {pending ? (
        <div className="grid gap-2">
          <progress
            aria-label="검수 채점 진행률"
            className="h-2 w-full accent-indigo-600"
            max={100}
            value={percent ?? undefined}
          />
          <p className="text-xs text-slate-500">
            {submissionProgressText(submission) ||
              '채점 서버 응답을 기다리고 있습니다.'}
          </p>
        </div>
      ) : null}
      {run.error ? (
        <div role="alert" className="grid gap-2 text-sm text-rose-700">
          <p>{run.error}</p>
          {submission && isSubmissionPending(submission.status) ? (
            <button
              type="button"
              onClick={onResume}
              className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
            >
              상태 다시 확인
            </button>
          ) : null}
        </div>
      ) : null}
      {submission ? (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-slate-500">실행 시간</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {submission.runtime_ms ?? submission.time_ms ?? '-'} ms
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">사용 메모리</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {formatMemoryKb(
                submission.memory_kb ?? submission.memory_usage_kb,
              )}
            </dd>
          </div>
        </dl>
      ) : null}
      {submission?.failed_testcase_order || detail.testcaseOrder ? (
        <p className="text-xs text-slate-600">
          실패 테스트케이스 #
          {submission?.failed_testcase_order ?? detail.testcaseOrder}
        </p>
      ) : null}
      {submission?.compile_message ? (
        <Log label="컴파일 메시지" text={submission.compile_message} />
      ) : null}
      {detail.message ? (
        <details className="min-w-0 text-xs text-slate-500">
          <summary className="cursor-pointer">채점 메시지</summary>
          <BoundedText className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700">
            {detail.message}
          </BoundedText>
        </details>
      ) : null}
      {detail.input !== undefined ? (
        <details className="min-w-0 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            실패 입력과 출력 비교
          </summary>
          <div className="mt-3 grid min-w-0 gap-3">
            <Log label="입력" text={detail.input} />
            <Log label="기대 출력" text={detail.expected ?? ''} />
            <Log label="실제 출력" text={detail.actual ?? ''} />
          </div>
        </details>
      ) : null}
      <details className="min-w-0 text-xs text-slate-500">
        <summary className="cursor-pointer">
          제출한 코드 · {judgeLanguageLabel(run.language)}
        </summary>
        <BoundedText className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100">
          {run.sourceCode}
        </BoundedText>
      </details>
    </section>
  );
}

function Log({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <BoundedText className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700">
        {text || '(비어 있음)'}
      </BoundedText>
    </div>
  );
}
