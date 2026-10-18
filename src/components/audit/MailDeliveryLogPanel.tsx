import InterfaceIcon from '@/components/common/InterfaceIcon';
import { type FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import {
  getMailLogPreview,
  listMailDeliveryLogs,
} from '@/domains/auditMonitoring/api';
import type {
  MailDeliveryLog,
  MailLogFilters,
} from '@/domains/auditMonitoring/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import { formatDateTime } from '@/shared/lib/dateTime';

const statuses = {
  pending: { label: '발송 대기', style: 'bg-slate-100 text-slate-600' },
  sending: { label: '발송 중', style: 'bg-indigo-50 text-indigo-700' },
  sent: { label: '발송 완료', style: 'bg-emerald-50 text-emerald-700' },
  failed: { label: '발송 실패', style: 'bg-rose-50 text-rose-700' },
  canceled: { label: '취소', style: 'bg-amber-50 text-amber-800' },
};
const mailTypes: Record<string, string> = {
  general_otp: '로그인 인증',
  staff_otp: '운영자 로그인 인증',
  participant_otp: '대회 참가자 인증',
  participant_invited: '참가자 초대',
  contest_operator_assigned: '운영자 초대',
  contest_question_created: '새 질문 알림',
  contest_question_answered: '질문 답변 알림',
  contest_reminder_24h: '대회 시작 24시간 전',
  contest_reminder_1h: '대회 시작 1시간 전',
  contest_reminder_10m: '대회 시작 10분 전',
  contact_inquiry_created: '서비스 문의 접수',
  contact_inquiry_answered: '서비스 문의 답변',
  contest_settings_updated: '대회 설정 변경',
  contest_notice_created: '대회 공지 알림',
};

function StatusBadge({ status }: { status: MailDeliveryLog['status'] }) {
  const display = statuses[status];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${display?.style ?? statuses.pending.style}`}
    >
      {display?.label ?? status}
    </span>
  );
}

function sentTime(log: MailDeliveryLog) {
  if (log.sent_at) return formatDateTime(log.sent_at);
  if (log.status === 'sent') return '기존 기록 · 시각 미기록';
  if (log.last_attempt_at) return `시도 ${formatDateTime(log.last_attempt_at)}`;
  return '아직 발송되지 않음';
}

function contestName(log: MailDeliveryLog) {
  if (log.contest_id) return log.contest_title || '삭제된 대회';
  return log.mail_type.startsWith('contest_') ||
    log.mail_type.startsWith('participant_')
    ? '대회 정보 미기록'
    : '서비스 공통';
}

export default function MailDeliveryLogPanel({
  token,
  contestId,
}: {
  token: string;
  contestId?: string;
}) {
  const visible = useDocumentVisibility();
  const [selectedMail, setSelectedMail] = useState<MailDeliveryLog | null>(
    null,
  );
  const [draft, setDraft] = useState({
    q: '',
    status: '',
    since: '',
    until: '',
  });
  const [filters, setFilters] = useState<MailLogFilters>({});
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [filterError, setFilterError] = useState('');
  const query = useQuery({
    queryKey: [
      'mail-logs',
      contestId ?? 'service',
      tokenQueryIdentity(token),
      filters,
      cursor ?? 'first',
    ],
    queryFn: () =>
      listMailDeliveryLogs(token, { ...filters, cursor, limit: 50 }, contestId),
    refetchInterval: visible && !cursor ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const logs = query.data?.data ?? [];
  const nextCursor = query.data?.page.next_cursor;

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (draft.since && draft.until && draft.since > draft.until) {
      setFilterError('종료일은 시작일과 같거나 이후여야 합니다.');
      return;
    }
    const since = draft.since
      ? new Date(`${draft.since}T00:00:00+09:00`).toISOString()
      : undefined;
    const until = draft.until
      ? new Date(
          new Date(`${draft.until}T00:00:00+09:00`).getTime() + 86_400_000,
        ).toISOString()
      : undefined;
    setFilters({
      q: draft.q.trim(),
      status: draft.status || undefined,
      since,
      until,
    });
    setFilterError('');
    setCursor(undefined);
    setHistory([]);
  }

  const fieldClass =
    'h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700';
  return (
    <section className="grid min-w-0 gap-4" aria-label="이메일 발송 로그">
      {selectedMail ? (
        <MailPreview
          log={selectedMail}
          token={token}
          contestId={contestId}
          onClose={() => setSelectedMail(null)}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-slate-600">
          발송 요청일 기준 최신순입니다. 첫 페이지는 10초마다 갱신됩니다.
        </p>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
      <form
        onSubmit={applyFilters}
        className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_9rem_10rem_10rem_auto]"
      >
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-600">
          검색
          <input
            className={fieldClass}
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
            placeholder={
              contestId ? '받는 이메일 또는 제목' : '받는 이메일, 제목, 대회명'
            }
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-600">
          발송 상태
          <select
            aria-label="발송 상태"
            className={fieldClass}
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value })
            }
          >
            <option value="">전체 상태</option>
            {Object.entries(statuses).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-600">
          요청 시작일 (KST)
          <input
            className={fieldClass}
            type="date"
            value={draft.since}
            onChange={(event) =>
              setDraft({ ...draft, since: event.target.value })
            }
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-slate-600">
          요청 종료일 (KST)
          <input
            className={fieldClass}
            type="date"
            value={draft.until}
            onChange={(event) =>
              setDraft({ ...draft, until: event.target.value })
            }
          />
        </label>
        <button
          type="submit"
          className="h-11 self-end rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          검색 적용
        </button>
      </form>
      {filterError ? (
        <p role="alert" className="text-sm text-rose-700">
          {filterError}
        </p>
      ) : null}
      {query.error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
        >
          {formatApiError(
            query.error,
            '이메일 발송 로그를 불러오지 못했습니다.',
          )}
        </p>
      ) : null}
      {query.isLoading ? (
        <p role="status" className="py-10 text-center text-sm text-slate-600">
          이메일 발송 로그를 불러오는 중입니다.
        </p>
      ) : null}
      {!query.isLoading && !query.error && logs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-600">
          조건에 맞는 이메일 발송 기록이 없습니다.
        </p>
      ) : null}
      {logs.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="w-full min-w-[850px] text-left text-sm">
              <caption className="sr-only">
                이메일 수신자, 제목, 상태와 발송 시각
              </caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  {[
                    '수신자',
                    '이메일',
                    ...(!contestId ? ['관련 대회'] : []),
                    '상태',
                    '요청 시각',
                    '발송 시각',
                  ].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log) => (
                  <tr key={log.mail_queue_id} className="align-top">
                    <td className="max-w-64 px-4 py-4 font-medium break-all text-slate-900">
                      {log.recipient_email}
                    </td>
                    <td className="max-w-lg min-w-56 px-4 py-4">
                      <p className="font-medium break-words text-slate-900">
                        {log.subject}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {mailTypes[log.mail_type] ?? log.mail_type}
                      </p>
                      <PreviewButton
                        log={log}
                        onOpen={() => setSelectedMail(log)}
                      />
                    </td>
                    {!contestId ? (
                      <td className="max-w-48 px-4 py-4 break-words text-slate-600">
                        {contestName(log)}
                      </td>
                    ) : null}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="min-w-36 px-4 py-4 text-xs leading-5 text-slate-600">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="min-w-36 px-4 py-4 text-xs leading-5 text-slate-600">
                      {sentTime(log)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {logs.map((log) => (
              <li
                key={log.mail_queue_id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    {mailTypes[log.mail_type] ?? log.mail_type}
                  </span>
                  <StatusBadge status={log.status} />
                </div>
                <div>
                  <p className="text-sm font-semibold break-words text-slate-900">
                    {log.subject}
                  </p>
                  <p className="mt-1 text-sm break-all text-slate-600">
                    받는 사람 · {log.recipient_email}
                  </p>
                </div>
                <PreviewButton log={log} onOpen={() => setSelectedMail(log)} />
                {!contestId ? (
                  <p className="text-xs text-slate-600">{contestName(log)}</p>
                ) : null}
                <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs leading-5">
                  <div>
                    <dt className="text-slate-400">요청 시각</dt>
                    <dd className="text-slate-600">
                      {formatDateTime(log.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">발송 시각</dt>
                    <dd className="text-slate-700">{sentTime(log)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>
          전체 {(query.data?.page.total_count ?? 0).toLocaleString('ko-KR')}건 ·
          현재 {logs.length}건
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!history.length || query.isFetching}
            onClick={() => {
              const previous = [...history];
              setCursor(previous.pop());
              setHistory(previous);
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 disabled:opacity-40"
          >
            이전
          </button>
          <button
            type="button"
            disabled={!nextCursor || query.isFetching}
            onClick={() => {
              setHistory([...history, cursor]);
              setCursor(nextCursor ?? undefined);
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </footer>
    </section>
  );
}

function PreviewButton({
  log,
  onOpen,
}: {
  log: MailDeliveryLog;
  onOpen: () => void;
}) {
  if (log.preview_restricted)
    return (
      <p className="mt-2 text-xs text-slate-600">
        인증·보호 메일 · 본문 미리보기 제한
      </p>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50"
      aria-label={`${log.subject} 이메일 내용 보기`}
    >
      <span className="line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere] text-slate-600">
        {log.body_preview || '내용 미리보기'}
      </span>
      <span className="mt-1 block text-xs font-semibold text-indigo-700">
        이메일 내용 보기 <InterfaceIcon name="arrowRight" />
      </span>
    </button>
  );
}

function MailPreview({
  log,
  token,
  contestId,
  onClose,
}: {
  log: MailDeliveryLog;
  token: string;
  contestId?: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: [
      'mail-preview',
      contestId ?? 'service',
      tokenQueryIdentity(token),
      log.mail_queue_id,
    ],
    queryFn: () => getMailLogPreview(token, log.mail_queue_id, contestId),
    staleTime: 60_000,
  });
  return (
    <ModalDialog
      title="이메일 내용 미리보기"
      description="발송 요청에 저장된 본문입니다."
      size="lg"
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>닫기</ModalButton>}
    >
      <div className="mb-4 grid gap-1 border-b border-slate-200 pb-4 text-sm [overflow-wrap:anywhere]">
        <strong>{log.subject}</strong>
        <span className="text-slate-600">
          받는 사람 · {log.recipient_email}
        </span>
        <span className="text-xs text-slate-600">
          요청 {formatDateTime(log.created_at)}
        </span>
      </div>
      {query.isLoading ? (
        <p role="status">본문을 불러오는 중입니다.</p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-rose-700">
          {formatApiError(query.error, '본문을 불러오지 못했습니다.')}
        </p>
      ) : query.data?.restricted ? (
        <p className="text-sm text-slate-600">
          인증번호 등 보호 정보가 담긴 메일은 본문을 표시하지 않습니다.
        </p>
      ) : (
        <>
          <div className="text-sm leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap text-slate-800">
            {query.data?.body_text || '텍스트 본문이 없습니다.'}
          </div>
          {query.data?.truncated ? (
            <p className="mt-4 text-xs text-slate-600">
              긴 본문은 앞부분 40,000자까지 표시합니다.
            </p>
          ) : null}
        </>
      )}
    </ModalDialog>
  );
}
