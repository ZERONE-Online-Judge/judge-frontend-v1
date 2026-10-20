import Select from '@/shared/ui/Select';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { rejudgingStatusLabel } from '@/domains/submissionScoreboard/rejudging';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRejudging,
  decideRejudging,
  getRejudging,
  listRejudgings,
} from '@/domains/submissionScoreboard/api';
import type {
  Rejudging,
  RejudgingResult,
  RejudgingTarget,
} from '@/domains/submissionScoreboard/rejudging';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import { formatApiError } from '@/shared/api/errors';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatMemoryKb } from '@/shared/lib/formatters';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import SubmissionStatusBadge from '@/shared/ui/SubmissionStatusBadge';
import { OperatorPanel } from '@/components/operator/OperatorShell';

const buttonClass =
  'rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50';

export default function RejudgingPanel({
  contestId,
  token,
  canRejudge,
  target,
  targetLabel,
  onCloseRequest,
}: {
  contestId: string;
  token: string;
  canRejudge: boolean;
  target: RejudgingTarget | null;
  targetLabel: string;
  onCloseRequest: () => void;
}) {
  const client = useQueryClient();
  const identity = tokenQueryIdentity(token);
  const visible = useDocumentVisibility();
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const history = useQuery({
    queryKey: ['operator', 'rejudgings', contestId, identity, offset],
    queryFn: () => listRejudgings(contestId, token, offset),
    refetchInterval: (query) =>
      visible &&
      query.state.data?.batches.some((batch) => batch.status === 'pending')
        ? 5_000
        : false,
    refetchIntervalInBackground: false,
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ['operator', 'rejudgings', contestId],
    });
    void client.invalidateQueries({
      queryKey: ['operator', 'rejudging', contestId],
    });
  };
  return (
    <>
      <OperatorPanel
        title="재채점 작업"
        description="새 결과를 비교한 뒤 반영합니다. 반영 전까지 기존 판정과 점수를 유지합니다."
      >
        {history.error ? <ErrorMessage error={history.error} /> : null}
        {history.isLoading ? (
          <p role="status" className="text-sm text-slate-500">
            작업 목록을 불러오는 중입니다.
          </p>
        ) : null}
        {!history.isLoading && !history.error && !history.data?.total ? (
          <p className="text-sm text-slate-500">
            아직 재채점 작업이 없습니다. 제출 상세에서 개별 재채점을 시작하거나
            문제 필터를 선택해 일괄 요청하세요.
          </p>
        ) : null}
        <div className="grid gap-2">
          {history.data?.batches.map((batch) => (
            <button
              type="button"
              key={batch.rejudging_id}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
              onClick={() => setSelectedId(batch.rejudging_id)}
            >
              <span className="grid min-w-0 gap-1">
                <strong className="text-sm text-slate-900">
                  문제 {batch.problem_code} ·{' '}
                  {batch.scope.kind === 'submission'
                    ? '개별 제출'
                    : '참가자 제출'}{' '}
                  {batch.total}개
                </strong>
                <span className="text-sm break-words text-slate-600">
                  {batch.reason}
                </span>
                <span className="text-xs text-slate-500">
                  {batch.requested_by_name} · {formatDateTime(batch.created_at)}
                </span>
              </span>
              <span className="grid shrink-0 gap-1 text-right">
                <span className="text-sm font-semibold text-indigo-700">
                  {rejudgingStatusLabel[batch.status]}
                </span>
                <span className="text-xs text-slate-500">
                  완료 {batch.completed}/{batch.total} · 판정 변경{' '}
                  {batch.changed_verdicts}개 · 결과 비교{' '}
                  <InterfaceIcon name="arrowRight" />
                </span>
              </span>
            </button>
          ))}
        </div>
        {history.data && history.data.total > 10 ? (
          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 10))}
            >
              이전
            </button>
            <span className="text-xs text-slate-500">
              {offset + 1}–{Math.min(offset + 10, history.data.total)} /{' '}
              {history.data.total}
            </span>
            <button
              type="button"
              className={buttonClass}
              disabled={offset + 10 >= history.data.total}
              onClick={() => setOffset((value) => value + 10)}
            >
              다음
            </button>
          </div>
        ) : null}
      </OperatorPanel>
      {target && canRejudge ? (
        <RequestModal
          key={JSON.stringify(target)}
          contestId={contestId}
          token={token}
          target={target}
          label={targetLabel}
          onClose={onCloseRequest}
          onCreated={(batch) => {
            onCloseRequest();
            setOffset(0);
            setSelectedId(batch.rejudging_id);
            refresh();
          }}
        />
      ) : null}
      {selectedId ? (
        <ComparisonModal
          key={selectedId}
          contestId={contestId}
          token={token}
          id={selectedId}
          canRejudge={canRejudge}
          onClose={() => setSelectedId('')}
          onDecided={refresh}
        />
      ) : null}
    </>
  );
}

function RequestModal({
  contestId,
  token,
  target,
  label,
  onClose,
  onCreated,
}: {
  contestId: string;
  token: string;
  target: RejudgingTarget;
  label: string;
  onClose: () => void;
  onCreated: (batch: Rejudging) => void;
}) {
  const [reason, setReason] = useState('');
  const [language, setLanguage] = useState('');
  const create = useMutation({
    mutationFn: () =>
      createRejudging(
        contestId,
        token,
        { ...target, ...(language ? { language } : {}) },
        reason.trim(),
      ),
    onSuccess: onCreated,
  });
  return (
    <ModalDialog
      title="재채점 요청"
      description={label}
      onClose={create.isPending ? undefined : onClose}
      size="md"
      footer={
        <>
          <ModalButton onClick={onClose} disabled={create.isPending}>
            닫기
          </ModalButton>
          <ModalButton
            tone="primary"
            onClick={() => create.mutate()}
            disabled={create.isPending || !reason.trim()}
          >
            {create.isPending ? '요청 중…' : '재채점 시작'}
          </ModalButton>
        </>
      }
    >
      <div className="grid gap-4 text-sm">
        <p className="rounded-lg bg-indigo-50 p-4 text-indigo-900">
          현재 테스트·체커·시간·메모리 제한으로 같은 코드를 다시 실행합니다.
          기존 판정은 유지하며 새 결과는 별도로 저장합니다.
        </p>
        {!target.submission_id ? (
          <>
            <p className="text-slate-600">
              선택한 문제{target.team_id ? '와 팀' : '의 모든 팀'}에서 채점이
              완료된 참가자 제출을 대상으로 합니다. 진행 중인 제출, 운영자
              검증·미리보기와 이후 들어오는 제출은 포함하지 않습니다.
            </p>
            <label className="grid gap-2 font-semibold text-slate-700">
              언어
              <Select
                className="rounded-lg border border-slate-200 p-3 font-normal"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="">모든 언어</option>
                {['c99', 'cpp17', 'python313', 'java8', 'pypy3', 'kotlin'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {judgeLanguageLabel(value)}
                    </option>
                  ),
                )}
              </Select>
            </label>
          </>
        ) : null}
        <label className="grid gap-2 font-semibold text-slate-700">
          재채점 사유
          <textarea
            autoFocus
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예: 테스트케이스 #13 기대 출력 수정"
            className="resize-y rounded-lg border border-slate-200 p-3 font-normal"
          />
        </label>
        <p className="text-xs text-slate-500">
          원래 제출 시각과 소스는 유지됩니다. 결과를 확인한 뒤 ‘새 결과 반영’을
          눌러야 판정과 점수가 바뀝니다. 판정 변경을 반영하면 입력한 사유가 해당
          참가자에게 알림으로 안내됩니다.
        </p>
        {create.error ? <ErrorMessage error={create.error} /> : null}
      </div>
    </ModalDialog>
  );
}

function ComparisonModal({
  contestId,
  token,
  id,
  canRejudge,
  onClose,
  onDecided,
}: {
  contestId: string;
  token: string;
  id: string;
  canRejudge: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const client = useQueryClient();
  const visible = useDocumentVisibility();
  const [offset, setOffset] = useState(0);
  const [confirmation, setConfirmation] = useState<'apply' | 'cancel' | null>(
    null,
  );
  const query = useQuery({
    queryKey: [
      'operator',
      'rejudging',
      contestId,
      tokenQueryIdentity(token),
      id,
      offset,
    ],
    queryFn: () => getRejudging(contestId, token, id, offset),
    refetchInterval: (current) =>
      visible && current.state.data?.status === 'pending' ? 3_000 : false,
    refetchIntervalInBackground: false,
  });
  const batch = query.data;
  const decision = useMutation({
    mutationFn: (action: 'apply' | 'cancel') =>
      decideRejudging(contestId, token, id, action),
    onSuccess: (_, action) => {
      setConfirmation(null);
      onDecided();
      if (action === 'apply') void client.invalidateQueries();
    },
  });
  const active =
    batch && ['pending', 'ready', 'blocked'].includes(batch.status);
  const decisionButtons =
    batch && active && canRejudge ? (
      <>
        <ModalButton
          disabled={decision.isPending}
          onClick={() => {
            decision.reset();
            setConfirmation('cancel');
          }}
        >
          작업 취소
        </ModalButton>
        <ModalButton
          tone="primary"
          disabled={batch.status !== 'ready' || decision.isPending}
          onClick={() => {
            decision.reset();
            setConfirmation('apply');
          }}
        >
          새 결과 반영
        </ModalButton>
      </>
    ) : null;
  return (
    <>
      <ModalDialog
        title="재채점 결과 비교"
        description={
          batch ? `문제 ${batch.problem_code} · ${batch.reason}` : undefined
        }
        size="wide"
        onClose={decision.isPending ? undefined : onClose}
        footer={
          <>
            <ModalButton onClick={onClose} disabled={decision.isPending}>
              닫기
            </ModalButton>
            {decisionButtons}
          </>
        }
      >
        {query.isLoading ? (
          <p role="status">결과를 불러오는 중입니다.</p>
        ) : null}
        {query.error ? <ErrorMessage error={query.error} /> : null}
        {batch ? (
          <div className="grid min-w-0 gap-4">
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 p-4 text-indigo-900"
            >
              <strong>{rejudgingStatusLabel[batch.status]}</strong>
              <span className="text-sm">
                완료 {batch.completed}/{batch.total} · 판정 변경{' '}
                {batch.changed_verdicts}개
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {batch.status === 'applied'
                ? `새 결과를 반영했습니다. ${batch.decided_by_email} · ${formatDateTime(batch.decided_at ?? '')}`
                : batch.status === 'cancelled'
                  ? '작업을 취소했습니다. 기존 판정과 점수를 유지하며 아래 실행 기록은 보존됩니다.'
                  : batch.status === 'blocked'
                    ? `시스템 에러 ${batch.system_errors}개가 있어 반영할 수 없습니다. 오류를 해결한 뒤 이 작업을 취소하고 다시 요청하세요.`
                    : '현재 공식 판정은 아래 기존 결과입니다. 새 결과를 반영하면 대회의 기존 점수 규칙으로 다시 계산합니다. 고정된 순위 발표 결과는 유지됩니다.'}
            </p>
            {batch.scope.skipped_pending > 0 ? (
              <p className="text-xs text-amber-700">
                요청 당시 진행 중이던 제출 {batch.scope.skipped_pending}개는
                제외했습니다.
              </p>
            ) : null}
            <div className="grid gap-3 md:hidden">
              {batch.items.map((item) => (
                <article
                  key={item.submission_id}
                  className={`rounded-lg border p-3 ${item.changed ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="font-mono">
                      {item.submission_id.slice(0, 8)}
                    </span>
                    <span>{judgeLanguageLabel(item.language)}</span>
                    {item.changed ? (
                      <strong className="text-amber-700">판정 변경</strong>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-semibold text-slate-500">
                        기존 결과
                      </p>
                      <ResultCell result={item.original_result} />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-2 text-xs font-semibold text-slate-500">
                        새 결과
                      </p>
                      <ResultCell result={item.candidate_result} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {formatDateTime(item.submitted_at)}
                  </p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3">제출 / 언어</th>
                    <th className="p-3">기존 결과</th>
                    <th className="p-3">새 결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.items.map((item) => (
                    <tr
                      key={item.submission_id}
                      className={item.changed ? 'bg-amber-50/50' : ''}
                    >
                      <td className="p-3 align-top">
                        <span className="font-mono text-xs">
                          {item.submission_id.slice(0, 8)}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          {judgeLanguageLabel(item.language)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(item.submitted_at)}
                        </p>
                        {item.changed ? (
                          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                            판정 변경
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 align-top">
                        <ResultCell result={item.original_result} />
                      </td>
                      <td className="p-3 align-top">
                        <ResultCell result={item.candidate_result} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batch.total > 50 ? (
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={offset === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - 50))}
                >
                  이전 결과
                </button>
                <span className="text-xs text-slate-500">
                  {offset + 1}–{Math.min(offset + 50, batch.total)} /{' '}
                  {batch.total}
                </span>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!batch.has_next}
                  onClick={() => setOffset((value) => value + 50)}
                >
                  다음 결과
                </button>
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              요청: {batch.requested_by_name} ·{' '}
              {formatDateTime(batch.created_at)}. 테스트나 제한이 바뀌거나 기존
              판정이 갱신되면 결과 반영을 차단합니다.
            </p>
          </div>
        ) : null}
      </ModalDialog>
      {confirmation && batch ? (
        <ModalDialog
          title={
            confirmation === 'apply'
              ? '새 판정과 점수를 반영할까요?'
              : '재채점을 취소할까요?'
          }
          onClose={decision.isPending ? undefined : () => setConfirmation(null)}
          size="md"
          footer={
            <>
              <ModalButton
                disabled={decision.isPending}
                onClick={() => setConfirmation(null)}
              >
                돌아가기
              </ModalButton>
              <ModalButton
                tone={confirmation === 'apply' ? 'primary' : 'danger'}
                disabled={decision.isPending}
                onClick={() => decision.mutate(confirmation)}
              >
                {decision.isPending
                  ? '처리 중…'
                  : confirmation === 'apply'
                    ? '결과 반영'
                    : '작업 취소'}
              </ModalButton>
            </>
          }
        >
          <p className="text-sm leading-7 text-slate-700">
            {confirmation === 'apply'
              ? `${batch.total}개 제출의 새 결과를 함께 반영합니다. 이 중 ${batch.changed_verdicts}개의 판정이 바뀝니다. 판정이 바뀐 참가자에게 기존·새 판정과 입력한 사유를 알림으로 안내합니다. 정답 취소나 오답 패널티가 발생할 수 있으며 원래 제출 시각으로 점수를 계산합니다. 고정된 순위 발표 결과는 유지됩니다. 이전 결과는 이 작업 기록에 보존됩니다.`
              : '대기 작업을 취소하고 실행 중인 작업의 결과를 받지 않습니다. 진행 중인 실행이 끝나더라도 판정과 점수에 반영하지 않으며 이미 도착한 기록은 보존됩니다.'}
          </p>
          {decision.error ? <ErrorMessage error={decision.error} /> : null}
        </ModalDialog>
      ) : null}
    </>
  );
}

function ResultCell({ result }: { result: RejudgingResult }) {
  return (
    <div className="grid gap-2">
      {result.status === 'cancelled' ? (
        <span className="text-xs font-semibold text-slate-500">채점 취소</span>
      ) : (
        <SubmissionStatusBadge submission={result} compact />
      )}
      <p className="text-xs text-slate-600">
        {result.runtime_ms == null ? '—' : `${result.runtime_ms}ms`} ·{' '}
        {formatMemoryKb(result.memory_kb)}
      </p>
      {result.failed_testcase_order != null ? (
        <p className="text-xs text-rose-700">
          실패 테스트 #{result.failed_testcase_order}
        </p>
      ) : null}
      {result.compile_message || result.judge_message ? (
        <details className="max-w-lg text-xs">
          <summary className="cursor-pointer font-semibold text-indigo-700">
            판정 메시지
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 font-mono whitespace-pre-wrap text-slate-900">
            {[result.compile_message, result.judge_message]
              .filter(Boolean)
              .join('\n\n')}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
      {formatApiError(error, '재채점 작업을 처리하지 못했습니다.')}
    </p>
  );
}
