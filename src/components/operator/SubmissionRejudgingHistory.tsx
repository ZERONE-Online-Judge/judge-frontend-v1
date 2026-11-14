import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSubmissionRejudgings } from '@/domains/submissionScoreboard/api';
import type { Rejudging } from '@/domains/submissionScoreboard/rejudging';
import { rejudgingStatusLabel } from '@/domains/submissionScoreboard/rejudging';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError, isApiClientError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import { formatDateTime } from '@/shared/lib/dateTime';
import SubmissionStatusBadge from '@/shared/ui/SubmissionStatusBadge';

type HistoryProps = {
  contestId: string;
  submissionId: string;
  token: string;
};

const statusClasses: Record<Rejudging['status'], string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  ready: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  blocked: 'border-rose-200 bg-rose-50 text-rose-700',
  applied: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
};

const statusDescriptions: Record<Rejudging['status'], string> = {
  pending: '재채점 중입니다. 반영 전까지 기존 판정과 점수를 유지합니다.',
  ready: '채점을 마쳤습니다. 운영자가 반영하면 판정과 점수가 바뀝니다.',
  blocked: '시스템 오류로 반영할 수 없습니다. 기존 판정과 점수를 유지합니다.',
  applied: '새 결과를 공식 판정과 점수에 반영했습니다.',
  cancelled: '재채점을 취소했습니다. 이 작업의 결과는 반영하지 않습니다.',
};

const pageButtonClass =
  'min-h-9 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-40';

export default function SubmissionRejudgingHistory(props: HistoryProps) {
  return (
    <HistoryContent
      key={`${props.contestId}:${props.submissionId}:${tokenQueryIdentity(props.token)}`}
      {...props}
    />
  );
}

function HistoryContent({ contestId, submissionId, token }: HistoryProps) {
  const [offset, setOffset] = useState(0);
  const visible = useDocumentVisibility();
  const history = useQuery({
    queryKey: [
      'operator',
      'submission-rejudgings',
      contestId,
      tokenQueryIdentity(token),
      submissionId,
      offset,
    ],
    queryFn: () =>
      getSubmissionRejudgings(contestId, submissionId, token, offset),
    enabled: Boolean(contestId && submissionId && token),
    refetchOnMount: 'always',
    refetchInterval: (query) =>
      visible &&
      !(
        isApiClientError(query.state.error) &&
        [401, 403].includes(query.state.error.status)
      ) &&
      query.state.data?.items.some((item) => item.status === 'pending')
        ? 2_000
        : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const forbidden =
    isApiClientError(history.error) && history.error.status === 403;
  const data =
    isApiClientError(history.error) && [401, 403].includes(history.error.status)
      ? undefined
      : history.data;

  return (
    <section className="grid min-w-0 gap-3" aria-label="이 제출의 재채점 이력">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">
          재채점 이력
          {data ? (
            <span className="ml-2 text-sm font-medium text-slate-500">
              {data.total}건
            </span>
          ) : null}
        </h3>
        {history.isFetching && data ? (
          <span role="status" className="text-xs text-slate-500">
            업데이트 중…
          </span>
        ) : null}
      </div>
      {history.isLoading ? (
        <p role="status" className="text-sm text-slate-500">
          재채점 이력을 불러오는 중입니다.
        </p>
      ) : null}
      {history.error ? (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          <p>
            {forbidden
              ? '이 제출의 재채점 이력을 볼 권한이 없습니다.'
              : formatApiError(
                  history.error,
                  '재채점 이력을 불러오지 못했습니다.',
                )}
          </p>
          {!forbidden ? (
            <button
              type="button"
              className="mt-2 min-h-9 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold hover:bg-rose-100 disabled:opacity-50"
              disabled={history.isFetching}
              onClick={() => void history.refetch()}
            >
              다시 불러오기
            </button>
          ) : null}
        </div>
      ) : null}
      {data?.total === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
          이 제출의 재채점 이력이 없습니다.
        </p>
      ) : null}
      {data?.items.map((item) => (
        <article
          key={item.rejudging_id}
          className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-3 sm:p-4"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="grid min-w-0 gap-1 text-xs text-slate-500">
              <time dateTime={item.created_at}>
                {formatDateTime(item.created_at)}
              </time>
              <p className="[overflow-wrap:anywhere] break-words">
                요청: {item.requested_by_name || item.requested_by_email}
              </p>
            </div>
            <strong
              className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs break-keep ${statusClasses[item.status]}`}
            >
              {rejudgingStatusLabel[item.status]}
            </strong>
          </div>
          <p className="text-sm leading-6 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-slate-700">
            {item.reason || '사유 없음'}
          </p>
          <div className="grid min-w-0 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 sm:gap-4">
            <div className="grid min-w-0 content-start gap-2">
              <p className="text-xs font-semibold text-slate-500">기존 결과</p>
              <SubmissionStatusBadge
                submission={item.original_result}
                compact
              />
            </div>
            <div className="grid min-w-0 content-start gap-2 border-t border-slate-200 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              <p className="text-xs font-semibold text-slate-500">
                {item.status === 'applied' ? '반영한 결과' : '재채점 결과'}
              </p>
              {item.candidate_result.status === 'cancelled' ? (
                <span className="text-xs font-semibold text-slate-500">
                  채점 취소
                </span>
              ) : (
                <SubmissionStatusBadge
                  submission={{
                    ...item.candidate_result,
                    ...(item.status === 'pending'
                      ? (item.rejudging_progress ?? {})
                      : {}),
                  }}
                />
              )}
              {item.changed && item.status !== 'pending' ? (
                <span className="text-xs font-semibold text-amber-700">
                  판정·점수 변경
                </span>
              ) : null}
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {statusDescriptions[item.status]}
          </p>
          {item.decided_at ? (
            <p className="text-xs leading-5 [overflow-wrap:anywhere] break-words text-slate-500">
              {item.status === 'applied' ? '반영' : '처리'}:{' '}
              {formatDateTime(item.decided_at)}
              {item.decided_by_email ? ` · ${item.decided_by_email}` : ''}
            </p>
          ) : null}
        </article>
      ))}
      {data && data.total > 10 ? (
        <nav
          className="flex min-w-0 flex-wrap items-center justify-end gap-2"
          aria-label="재채점 이력 페이지"
        >
          <span className="mr-auto text-xs text-slate-500 tabular-nums">
            {offset + 1}–{Math.min(offset + 10, data.total)} / {data.total}
          </span>
          <button
            type="button"
            className={pageButtonClass}
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - 10))}
          >
            이전 이력
          </button>
          <button
            type="button"
            className={pageButtonClass}
            disabled={!data.has_next}
            onClick={() => setOffset((value) => value + 10)}
          >
            다음 이력
          </button>
        </nav>
      ) : null}
    </section>
  );
}
