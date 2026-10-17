import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import VerificationTestResults from '@/components/operator/VerificationTestResults';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatUserApiError } from '@/shared/api/errors';
import {
  getVerificationCases,
  verificationExpectationMatches,
} from '@/domains/problemManagement/verificationExecution';
import VerificationAnalysisPanel from '@/components/operator/VerificationAnalysisPanel';
import { formatDateTime } from '@/shared/lib/dateTime';
import type { ProblemAsset } from '@/domains/problemManagement/types';
import { parseVerificationDetails } from '@/domains/problemManagement/verificationDetails';
import {
  VERIFICATION_CODE_KINDS,
  isVerificationRunning,
  type VerificationCodeKind,
  type VerificationRunResult,
} from '@/domains/problemManagement/useVerificationCodeRuns';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionProgressText,
  submissionStatusLabel,
} from '@/domains/submissionScoreboard/status';

export default function VerificationCodeSection({
  contestId,
  token,
  aiAvailable,
  historyError,
  assetsByKind,
  onDelete,
  onDismiss,
  onPreview,
  onRun,
  onUpload,
  results,
}: {
  contestId: string;
  token: string;
  aiAvailable: boolean;
  historyError?: string | null;
  assetsByKind: Map<VerificationCodeKind, ProblemAsset[]>;
  onDelete: (asset: ProblemAsset) => void;
  onDismiss: (id: string) => void;
  onPreview: (asset: ProblemAsset, label: string) => void;
  onRun: (asset: ProblemAsset, expectedStatus: VerificationCodeKind) => void;
  onUpload: (expectedStatus: VerificationCodeKind, files: File[]) => void;
  results: VerificationRunResult[];
}) {
  const runningCount = results.filter(isVerificationRunning).length;

  return (
    <section className="grid min-w-0 gap-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-base font-semibold text-slate-950">
            검증 코드 채점
          </h3>
          <p className="text-sm leading-6 font-normal text-slate-500">
            파일을 추가하면 모든 테스트를 끝까지 채점합니다. 각 코드가 기대한
            결과로 판정되는지 확인하세요. AI 검증은 ‘AI 분석하기’를 눌렀을 때만
            시작합니다. 코드별 마지막 채점 결과와 AI 분석은 서버에 저장되어
            새로고침하거나 다른 운영자가 열어도 함께 볼 수 있습니다.
          </p>
        </div>
        {runningCount ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
            <span className="size-1.5 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
            {runningCount}개 처리 중
          </span>
        ) : null}
      </div>

      {historyError ? (
        <p role="alert" className="text-sm text-rose-700">
          {historyError}
        </p>
      ) : null}
      <div className="grid gap-3">
        {VERIFICATION_CODE_KINDS.map((kind) => {
          const assets = assetsByKind.get(kind.expectedStatus) ?? [];
          const kindResults = results.filter(
            (result) => result.expectedStatus === kind.expectedStatus,
          );
          const trackedAssets = new Set(
            kindResults.map((result) => result.asset?.asset_id),
          );
          const rows = [
            ...assets
              .filter((asset) => !trackedAssets.has(asset.asset_id))
              .map((asset) => ({
                id: asset.asset_id,
                filename: asset.original_filename,
                asset,
                result: undefined as VerificationRunResult | undefined,
              })),
            ...kindResults.map((result) => ({
              id: result.id,
              filename: result.filename,
              asset: result.asset,
              result,
            })),
          ].sort((a, b) =>
            a.filename.localeCompare(b.filename, 'ko-KR', { numeric: true }),
          );

          return (
            <section
              aria-label={kind.label}
              className="min-w-0 overflow-hidden rounded-lg border border-slate-200"
              key={kind.expectedStatus}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 px-4 py-3">
                <div className="grid gap-1">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {kind.label}
                    <span className="text-xs font-normal text-slate-500">
                      {rows.length}개
                    </span>
                  </h4>
                  <p className="text-xs font-normal text-slate-500">
                    기대 판정 <span className="mx-1 text-slate-300">·</span>{' '}
                    {submissionStatusLabel(kind.expectedStatus)}
                  </p>
                </div>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition focus-within:ring-2 focus-within:ring-indigo-400 hover:border-indigo-300 hover:text-indigo-700">
                  <svg
                    aria-hidden="true"
                    className="size-3.5"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                  파일 추가
                  <input
                    accept=".c,.cc,.cpp,.cxx,.py,.kt,.java,text/plain"
                    aria-label={`${kind.label} 파일 선택`}
                    className="sr-only"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      if (files.length) onUpload(kind.expectedStatus, files);
                      event.currentTarget.value = '';
                    }}
                    type="file"
                  />
                </label>
              </div>

              {rows.length ? (
                <div className="divide-y divide-slate-100 border-t border-slate-200">
                  {rows.map((row) => (
                    <VerificationCodeRow
                      contestId={contestId}
                      token={token}
                      aiAvailable={aiAvailable}
                      asset={row.asset}
                      expectedStatus={kind.expectedStatus}
                      filename={row.filename}
                      key={row.id}
                      label={kind.label}
                      onDelete={onDelete}
                      onDismiss={onDismiss}
                      onPreview={onPreview}
                      onRun={onRun}
                      result={row.result}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-t border-dashed border-slate-200 px-4 py-5 text-center text-xs font-normal text-slate-400">
                  등록된 {kind.label}가 없습니다.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function VerificationCodeRow({
  contestId,
  token,
  aiAvailable,
  asset,
  expectedStatus,
  filename,
  label,
  onDelete,
  onDismiss,
  onPreview,
  onRun,
  result,
}: {
  contestId: string;
  token: string;
  aiAvailable: boolean;
  asset?: ProblemAsset;
  expectedStatus: VerificationCodeKind;
  filename: string;
  label: string;
  onDelete: (asset: ProblemAsset) => void;
  onDismiss: (id: string) => void;
  onPreview: (asset: ProblemAsset, label: string) => void;
  onRun: (asset: ProblemAsset, expectedStatus: VerificationCodeKind) => void;
  result?: VerificationRunResult;
}) {
  const isBusy = isVerificationRunning(result);
  const [expanded, setExpanded] = useState(true);
  const sid = result?.submission?.submission_id;
  const cases = useQuery({
    queryKey: [
      'operator',
      'verification-cases',
      contestId,
      result?.problemId,
      sid,
      tokenQueryIdentity(token),
    ],
    queryFn: () =>
      getVerificationCases(contestId, result!.problemId, sid!, token),
    enabled: Boolean(sid && expanded),
    placeholderData: () => undefined,
    refetchInterval: isBusy && expanded ? 1500 : false,
    staleTime: 0,
  });
  const refetchCases = cases.refetch;
  useEffect(() => {
    if (sid && !isBusy && expanded) void refetchCases();
  }, [sid, isBusy, expanded, refetchCases]);
  const shownResult = result
    ? {
        ...result,
        execution:
          !expanded && result.execution
            ? result.execution
            : (cases.data?.execution ?? result.execution),
      }
    : undefined;
  const matches =
    shownResult &&
    verificationExpectationMatches(
      expectedStatus,
      shownResult.submission?.status,
      shownResult.execution,
    );
  const [pythonRuntime, setPythonRuntime] = useState(
    asset?.source_language === 'pypy3' ||
      result?.submission?.language === 'pypy3'
      ? 'pypy3'
      : 'python313',
  );
  return (
    <div
      aria-label={filename}
      role="group"
      className="grid min-w-0 gap-3 px-4 py-3.5"
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label={`${filename} 결과 ${expanded ? '접기' : '펼치기'}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              <path d="m7 4 6 6-6 6" />
            </svg>
          </button>
          <div className="grid min-w-0 flex-1 gap-2">
            <button
              className="w-fit max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700 disabled:text-slate-900"
              disabled={!asset}
              onClick={() => asset && onPreview(asset, label)}
              title={filename}
              type="button"
            >
              {filename}
            </button>
            {result ? (
              <p className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>기대 {submissionStatusLabel(expectedStatus)}</span>
                {!isBusy ? (
                  <span
                    className={
                      matches
                        ? 'font-medium text-emerald-700'
                        : 'font-medium text-amber-800'
                    }
                  >
                    {matches ? '기대 판정 일치' : '기대 판정 불일치'}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs font-normal text-slate-400">
                채점 기록 없음
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {filename.endsWith('.py') ? (
            <select
              aria-label={`${filename} 실행 언어`}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
              disabled={isBusy}
              value={pythonRuntime}
              onChange={(event) => setPythonRuntime(event.target.value)}
            >
              <option value="python313">Python 3.13</option>
              <option value="pypy3">PyPy 3.9</option>
            </select>
          ) : null}
          <button
            className="h-8 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!asset}
            onClick={() => asset && onPreview(asset, label)}
            type="button"
          >
            보기
          </button>
          <button
            className="h-8 rounded-md border border-indigo-200 bg-indigo-50/60 px-2.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!asset || isBusy}
            onClick={() =>
              asset &&
              onRun(
                filename.endsWith('.py')
                  ? {
                      ...asset,
                      source_language: pythonRuntime as 'pypy3' | 'python313',
                    }
                  : asset,
                expectedStatus,
              )
            }
            type="button"
          >
            {isBusy ? '처리 중' : '채점'}
          </button>
          <button
            className="h-8 rounded-md px-2 text-xs font-normal text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isBusy}
            onClick={() =>
              asset ? onDelete(asset) : result && onDismiss(result.id)
            }
            type="button"
          >
            삭제
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="grid min-w-0 gap-4">
          {shownResult ? (
            <VerificationResultSummary result={shownResult} />
          ) : null}
          {sid && cases.data?.execution ? (
            <VerificationTestResults
              key={sid}
              contestId={contestId}
              problemId={result!.problemId}
              submissionId={sid}
              token={token}
              data={cases.data}
              expectedStatus={expectedStatus}
            />
          ) : null}
          {result?.persisted &&
          !isBusy &&
          cases.data &&
          !cases.data.execution ? (
            <p className="text-xs leading-5 text-slate-500">
              이전 채점 방식으로 저장된 기록입니다. ‘채점’을 누르면 전체 테스트
              결과를 새로 저장합니다.
            </p>
          ) : null}
          {cases.error ? (
            <p role="alert" className="text-xs text-rose-700">
              {formatUserApiError(
                cases.error,
                '테스트별 결과를 불러오지 못했습니다.',
              )}
            </p>
          ) : null}
          {result ? (
            <VerificationResultDetails
              key={result.submission?.submission_id ?? result.id}
              result={result}
            />
          ) : null}
          {result?.submission &&
          !isSubmissionPending(result.submission.status) &&
          !matches ? (
            result.snapshotAvailable === false ? (
              <p className="text-xs leading-5 text-slate-500 sm:ml-12">
                채점 당시 자료가 저장되지 않은 기록입니다. AI 분석은 다시 채점한
                뒤 요청할 수 있습니다.
              </p>
            ) : (
              <VerificationAnalysisPanel
                contestId={contestId}
                problemId={result.problemId}
                submissionId={result.submission.submission_id}
                token={token}
                available={aiAvailable}
                initial={result.analysis}
                stale={result.stale}
              />
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VerificationResultSummary({
  result,
}: {
  result: VerificationRunResult;
}) {
  const actualStatus = result.submission?.status;
  const isWorking = isVerificationRunning(result);
  const isComplete =
    !result.error &&
    !isWorking &&
    actualStatus &&
    !isSubmissionPending(actualStatus);
  const passed =
    isComplete &&
    verificationExpectationMatches(
      result.expectedStatus,
      actualStatus,
      result.execution,
    );
  const failed = isComplete && !passed;
  const progressText = submissionProgressText(result.submission);
  const progressPercent = submissionProgressPercent(result.submission);
  const currentLabel = result.error
    ? '처리 실패'
    : actualStatus
      ? submissionStatusLabel(actualStatus)
      : verificationStageLabel(result.stage);
  const testcaseOrder =
    result.submission?.failed_testcase_order ??
    parseVerificationDetails(result.submission?.judge_message).testcaseOrder;

  return (
    <div aria-live="polite" className="grid min-w-0 gap-2">
      <div
        className={
          result.execution
            ? 'hidden'
            : 'flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs'
        }
      >
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium',
            result.error
              ? 'bg-rose-50 text-rose-700'
              : passed
                ? 'bg-emerald-50 text-emerald-700'
                : failed
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-indigo-50 text-indigo-700',
          ].join(' ')}
          title={
            passed
              ? '기대 판정과 일치합니다.'
              : failed
                ? `기대 판정: ${submissionStatusLabel(result.expectedStatus)}`
                : currentLabel
          }
        >
          {passed ? (
            <svg
              aria-hidden="true"
              className="size-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3.5 8 3 3 6-6" />
            </svg>
          ) : failed || result.error ? (
            <span aria-hidden="true">!</span>
          ) : (
            <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
          )}
          {passed
            ? '기대 판정 일치'
            : failed
              ? '기대 판정 불일치'
              : currentLabel}
        </span>
        {isComplete ? (
          <span className="font-normal text-slate-500">
            판정{' '}
            <span className="font-medium text-slate-700">{currentLabel}</span>
          </span>
        ) : null}
        {testcaseOrder !== undefined && testcaseOrder !== null ? (
          <span className="font-normal text-slate-400">
            테스트케이스 #{testcaseOrder}
          </span>
        ) : null}
      </div>
      {isWorking || result.execution ? (
        <div className="grid w-full gap-1.5">
          <div
            aria-label={`${result.filename} 진행도`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              result.execution
                ? Math.round(
                    (100 * result.execution.completed) /
                      Math.max(1, result.execution.total),
                  )
                : (progressPercent ?? undefined)
            }
            aria-valuetext={progressText || currentLabel}
            role="progressbar"
            className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className={`h-full rounded-full bg-indigo-500 transition-all duration-300 ${progressPercent === null ? 'motion-safe:animate-pulse' : ''}`}
              style={{
                width: result.execution
                  ? `${(100 * result.execution.completed) / Math.max(1, result.execution.total)}%`
                  : progressPercent === null
                    ? '25%'
                    : `${progressPercent}%`,
              }}
            />
          </div>
          <p className="text-xs font-normal text-slate-500">
            {result.execution
              ? `${isWorking ? '전체 테스트 채점 중' : result.execution.full_suite_complete ? '검증 종료' : '검증 중단'} · 판정 확인 ${result.execution.completed} / ${result.execution.total}개 · ${Math.round((100 * result.execution.completed) / Math.max(1, result.execution.total))}%`
              : progressText ||
                verificationStageHelp(result.stage, actualStatus)}
          </p>
        </div>
      ) : null}
      {result.persisted ? (
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs font-normal text-slate-500">
          <span>서버 저장 · 운영자 공유</span>
          {result.submission?.submitted_at ? (
            <span>
              마지막 채점 요청{' '}
              <time dateTime={result.submission.submitted_at}>
                {formatDateTime(result.submission.submitted_at)}
              </time>
            </span>
          ) : null}
          {result.submission?.submitted_by_name ? (
            <span>· {result.submission.submitted_by_name}</span>
          ) : null}
        </p>
      ) : null}
      {result.stale && passed ? (
        <p className="text-xs font-medium text-amber-800">
          문제 자료가 변경됨 · 이전 채점 기준의 결과입니다.
        </p>
      ) : null}
      {result.error ? (
        <p className="text-xs leading-5 font-normal break-words text-rose-600">
          {result.error}
        </p>
      ) : null}
    </div>
  );
}

function VerificationResultDetails({
  result,
}: {
  result: VerificationRunResult;
}) {
  const { judge_message: judgeMessage, compile_message: compileMessage } =
    result.submission ?? {};
  if (!judgeMessage && !compileMessage) return null;
  const detail = parseVerificationDetails(judgeMessage);
  const hasComparison = detail.input !== undefined;

  return (
    <details className="group min-w-0 sm:ml-12">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-indigo-700 [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-90"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 3 5 5-5 5" />
        </svg>
        상세 보기
      </summary>
      <div className="mt-3 grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
        {hasComparison ? (
          <>
            <VerificationLogBlock label="입력" text={detail.input!} />
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <VerificationLogBlock label="기대 출력" text={detail.expected!} />
              <VerificationLogBlock label="실제 출력" text={detail.actual!} />
            </div>
          </>
        ) : detail.message ? (
          <VerificationLogBlock label="채점 메시지" text={detail.message} />
        ) : null}
        {compileMessage ? (
          <VerificationLogBlock label="컴파일 로그" text={compileMessage} />
        ) : null}
        {judgeMessage ? (
          <details className="min-w-0">
            <summary className="w-fit cursor-pointer text-xs font-normal text-slate-500 hover:text-slate-800">
              원본 로그
            </summary>
            <div className="mt-2 min-w-0">
              <VerificationLogBlock
                label="채점 원본 로그"
                text={judgeMessage}
              />
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function VerificationLogBlock({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <pre
        aria-label={label}
        tabIndex={0}
        className="max-h-48 min-w-0 overflow-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-6 font-normal text-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        {text === '' ? (
          <span className="font-sans text-slate-400">(빈 내용)</span>
        ) : (
          text
        )}
      </pre>
    </div>
  );
}

function verificationStageLabel(stage?: VerificationRunResult['stage']) {
  switch (stage) {
    case 'uploading':
      return '업로드 중';
    case 'loading_source':
      return '코드 불러오는 중';
    case 'submitting':
      return '채점 제출 중';
    case 'judging':
      return '채점 중';
    case 'done':
      return '채점 완료';
    default:
      return '채점 대기';
  }
}

function verificationStageHelp(
  stage?: VerificationRunResult['stage'],
  status?: string | null,
) {
  if (status === 'waiting') return '채점 큐에서 순서를 기다리는 중입니다.';
  if (status === 'preparing') return '채점 환경을 준비하는 중입니다.';
  if (status === 'judging') return '테스트케이스를 실행하는 중입니다.';
  switch (stage) {
    case 'uploading':
      return '검증 코드를 등록하는 중입니다.';
    case 'loading_source':
      return '저장된 검증 코드를 불러오는 중입니다.';
    case 'submitting':
      return '채점 큐에 제출하는 중입니다.';
    default:
      return '채점 서버 응답을 기다리는 중입니다.';
  }
}
