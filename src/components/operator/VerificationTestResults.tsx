import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from '@/shared/ui/Modal';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatUserApiError } from '@/shared/api/errors';
import {
  getVerificationCaseDetail,
  verificationStatusCode,
  verificationExpectationMatches,
  type VerificationCases,
  type VerificationCasePreview,
} from '@/domains/problemManagement/verificationExecution';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';

export default function VerificationTestResults({
  contestId,
  problemId,
  submissionId,
  token,
  data,
  expectedStatus,
}: {
  contestId: string;
  problemId: string;
  submissionId: string;
  token: string;
  data: VerificationCases;
  expectedStatus: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const detail = useQuery({
    queryKey: [
      'operator',
      'verification-case-detail',
      contestId,
      problemId,
      submissionId,
      selected,
      tokenQueryIdentity(token),
    ],
    queryFn: () =>
      getVerificationCaseDetail(
        contestId,
        problemId,
        submissionId,
        selected!,
        token,
      ),
    enabled: selected !== null,
    placeholderData: () => undefined,
    staleTime: Infinity,
  });
  const execution = data.execution;
  if (!execution) return null;
  const completed = new Map(data.testcases.map((item) => [item.index, item]));
  // Display immutable execution indices, including non-contiguous imported cases.
  const indices =
    data.indices ?? Array.from({ length: execution.total }, (_, i) => i + 1);
  return (
    <div className="grid min-w-0 gap-4">
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {['기대 판정 범위', '기대', '실행 / 전체', '관측', '검증'].map(
                (label) => (
                  <th key={label} className="px-3 py-2.5 font-medium">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="text-slate-700">
              <td className="px-3 py-3">
                활성 테스트
                {execution.testcase_version !== null
                  ? ` · v${execution.testcase_version}`
                  : ''}
              </td>
              <td className="px-3 py-3">
                {verificationStatusCode(expectedStatus)}
              </td>
              <td className="px-3 py-3">
                {execution.completed} / {execution.total}
              </td>
              <td className="px-3 py-3">
                {execution.observed_statuses
                  .map(verificationStatusCode)
                  .join(' · ') || '—'}
              </td>
              <td className="px-3 py-3">
                {execution.full_suite_complete
                  ? verificationExpectationMatches(
                      expectedStatus,
                      undefined,
                      execution,
                    )
                    ? '일치'
                    : '불일치'
                  : '미완료'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        <span>
          {execution.node_name || '채점기 배정 대기'}
          {execution.agent_version
            ? ` · v${execution.agent_version}`
            : ''} · {execution.total}개 테스트
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>
            최대 실행 시간{' '}
            <strong className="ml-1 text-slate-900">
              {execution.runtime_ms === null
                ? '—'
                : `${execution.runtime_ms}ms`}
            </strong>
          </span>
          <span>
            최대 메모리{' '}
            <strong className="ml-1 text-slate-900">
              {execution.memory_kb === null
                ? '—'
                : `${(execution.memory_kb / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MiB`}
            </strong>
          </span>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        테스트 번호를 누르면 채점 당시 입력·기대 출력·실제 출력과 시간·메모리를
        확인할 수 있습니다.
      </p>
      <div className="grid max-h-[36rem] grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 overflow-auto p-1">
        {indices.map((index) => {
          const item = completed.get(index);
          const tone = !item
            ? 'border-slate-200 bg-slate-50 text-slate-400'
            : item.final_status === 'accepted'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : item.final_status === 'system_error'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-amber-200 bg-amber-50 text-amber-800';
          return (
            <button
              key={index}
              type="button"
              disabled={!item}
              onClick={() => setSelected(index)}
              aria-label={`테스트 #${index} ${item ? submissionStatusLabel(item.final_status) : '채점 대기'} 상세 보기`}
              className={`grid min-h-24 content-center justify-items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-default ${tone}`}
            >
              <span className="opacity-70">#{index}</span>
              <strong className="text-sm">
                {item ? verificationStatusCode(item.final_status) : '대기'}
              </strong>
              <span>
                {item?.runtime_ms !== null && item?.runtime_ms !== undefined
                  ? `${item.runtime_ms}ms`
                  : '—'}
              </span>
            </button>
          );
        })}
      </div>
      {selected !== null ? (
        <Modal
          aria-label={`테스트 #${selected} 채점 상세`}
          onClose={() => setSelected(null)}
        >
          <section className="grid w-full max-w-5xl gap-5 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <header className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold text-slate-950">
                  테스트 #{selected}
                </h3>
                {detail.data ? (
                  <p className="text-sm text-slate-500">
                    {submissionStatusLabel(detail.data.final_status)} ·{' '}
                    {detail.data.runtime_ms ?? '—'}ms ·{' '}
                    {detail.data.memory_kb === null
                      ? '—'
                      : `${(detail.data.memory_kb / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MiB`}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                onClick={() => setSelected(null)}
              >
                닫기
              </button>
            </header>
            {detail.isPending ? (
              <p role="status" className="text-sm text-slate-500">
                채점 당시 자료를 불러오는 중…
              </p>
            ) : null}
            {detail.error ? (
              <p role="alert" className="text-sm text-rose-700">
                {formatUserApiError(
                  detail.error,
                  '테스트 결과를 불러오지 못했습니다.',
                )}
              </p>
            ) : null}
            {detail.data ? (
              <>
                <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                  <Preview title="입력" value={detail.data.input} />
                  <Preview title="기대 출력" value={detail.data.expected} />
                  <Preview title="실제 출력" value={detail.data.actual} />
                </div>
                {detail.data.judge_message ? (
                  <details className="min-w-0 text-xs text-slate-500">
                    <summary className="cursor-pointer">채점 메시지</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 break-all whitespace-pre-wrap">
                      {detail.data.judge_message}
                    </pre>
                  </details>
                ) : null}
              </>
            ) : null}
          </section>
        </Modal>
      ) : null}
    </div>
  );
}
function Preview({
  title,
  value,
}: {
  title: string;
  value: VerificationCasePreview | null;
}) {
  return (
    <section className="grid min-w-0 content-start gap-2">
      <h4 className="text-sm font-medium text-slate-700">{title}</h4>
      {value ? (
        <>
          <pre className="max-h-96 min-h-28 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-900">
            {value.text || '(빈 출력)'}
          </pre>
          {value.truncated ? (
            <p className="text-xs text-amber-700">
              저장된 앞부분만 표시합니다
              {value.size !== null
                ? ` · 전체 ${value.size.toLocaleString()}바이트`
                : ''}
              .
            </p>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          이 실행에는 실제 출력이 저장되지 않았습니다.
        </p>
      )}
    </section>
  );
}
