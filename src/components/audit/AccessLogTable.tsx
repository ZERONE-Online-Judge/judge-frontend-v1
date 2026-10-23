import { useState } from 'react';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import type { AccessLog } from '@/domains/auditMonitoring/types';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/dateTime';

type AccessLogTableProps = {
  logs: AccessLog[];
  loading?: boolean;
  showContest?: boolean;
};

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    general_login: 'ZOJ 로그인',
    operator_access: '운영자 대회 접속',
    presentation_login: '발표 계정 로그인',
    general_refresh: '세션 갱신',
    login_failed: '로그인 실패',
    login_verification_required: '새 환경 본인 인증 요청',
    passkey_registered: '패스키 등록',
    passkey_removed: '패스키 삭제',
    logout: '로그아웃',
    account_revoked: '운영자 강제 로그아웃',
    participant_login: '참가자 로그인',
    participant_session_check: '참가자 세션 확인',
    participant_session_issued: '참가자 세션 발급',
    session_conflict: '중복 세션 감지',
  };
  return labels[eventType] ?? eventType;
}

function eventClassName(eventType: string) {
  if (eventType === 'login_failed')
    return 'border-rose-200 bg-rose-50 text-rose-700';
  if (
    eventType === 'session_conflict' ||
    eventType === 'login_verification_required'
  )
    return 'border-amber-200 bg-amber-50 text-amber-700';
  if (eventType === 'logout' || eventType === 'account_revoked')
    return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function accountScopeLabel(scope: string) {
  if (scope === 'participant') return '참가자';
  if (scope === 'general') return '일반 계정';
  if (scope === 'staff') return '운영진';
  return scope;
}

function roleLabel(role?: string | null) {
  if (role === 'service_master') return '서비스 마스터';
  if (role === 'operator') return '운영자';
  if (role === 'participant') return '참가자';
  if (role === 'general') return '일반 계정';
  return '권한 확인 전';
}

function displayAccount(log: AccessLog) {
  const name = log.member_name || log.display_name;
  if (name && log.email) return `${name} · ${log.email}`;
  return name || log.email || '확인 불가';
}

function contestLabel(log: AccessLog) {
  if (!log.contest_id) return '전체 서비스';
  return log.contest_title ? `${log.contest_title}` : log.contest_id;
}

function detailsJson(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return '';
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return '';
  }
}

export default function AccessLogTable({
  logs,
  loading = false,
  showContest = true,
}: AccessLogTableProps) {
  const [selected, setSelected] = useState<AccessLog | null>(null);
  if (loading && logs.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
        접속 로그를 불러오는 중입니다.
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
        아직 기록된 접속 로그가 없습니다.
      </div>
    );
  }

  return (
    <>
      <div className="grid min-w-0 gap-3 md:hidden">
        {logs.map((log) => (
          <article
            key={log.access_log_id}
            className="min-w-0 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span
                className={[
                  'rounded-full border px-2.5 py-1 text-xs font-semibold',
                  eventClassName(log.event_type),
                ].join(' ')}
              >
                {eventLabel(log.event_type)}
              </span>
              <time
                dateTime={log.created_at}
                className="text-xs text-slate-500"
              >
                {formatDateTime(log.created_at)}
              </time>
            </div>
            <p className="mt-3 font-semibold [overflow-wrap:anywhere] text-slate-900">
              {log.member_name || log.display_name || '이름 없음'}
            </p>
            <p className="mt-1 text-xs [overflow-wrap:anywhere] text-slate-600">
              {log.email || '이메일 없음'}
            </p>
            {showContest ? (
              <p className="mt-2 text-xs [overflow-wrap:anywhere] text-slate-500">
                {contestLabel(log)}
              </p>
            ) : null}
            <p className="mt-1 text-sm [overflow-wrap:anywhere] text-slate-600">
              {log.team_name || roleLabel(log.actor_role)}
            </p>
            <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="min-w-0 text-xs [overflow-wrap:anywhere] text-slate-500">
                {log.client_ip || 'IP 정보 없음'}
              </span>
              <button
                type="button"
                aria-label={`${displayAccount(log)} 접속 상세 보기`}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => setSelected(log)}
              >
                상세 보기
              </button>
            </div>
          </article>
        ))}
      </div>
      <div
        className="hidden max-w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 md:block"
        role="region"
        aria-label="접속 로그 목록"
        tabIndex={0}
      >
        <table className="w-full min-w-[840px] table-fixed divide-y divide-slate-200 text-sm">
          <colgroup>
            <col className="w-40" />
            <col />
            <col className="w-48" />
            <col className="w-44" />
            <col className="w-24" />
          </colgroup>
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              {[
                '시간',
                '계정',
                showContest ? '대회 / 팀' : '참가팀',
                '접속 내용',
                '상세',
              ].map((label) => (
                <th scope="col" className="px-4 py-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {logs.map((log) => (
              <tr
                className="align-top transition hover:bg-slate-50"
                key={log.access_log_id}
              >
                <td className="px-4 py-4">
                  <time
                    dateTime={log.created_at}
                    title={formatDateTime(log.created_at)}
                    className="grid gap-1"
                  >
                    <span className="font-medium text-slate-900">
                      {formatRelativeTime(log.created_at)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(log.created_at)}
                    </span>
                  </time>
                </td>
                <td className="px-4 py-4">
                  <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]">
                    <span className="font-semibold text-slate-900">
                      {log.member_name || log.display_name || '이름 없음'}
                    </span>
                    <span className="text-xs text-slate-600">
                      {log.email || '이메일 없음'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {roleLabel(log.actor_role)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4 [overflow-wrap:anywhere]">
                  {showContest ? (
                    <p className="mb-1 font-medium text-slate-900">
                      {contestLabel(log)}
                    </p>
                  ) : null}
                  <p className="text-slate-600">{log.team_name || '—'}</p>
                </td>
                <td className="px-4 py-4">
                  <span
                    className={[
                      'inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold [overflow-wrap:anywhere]',
                      eventClassName(log.event_type),
                    ].join(' ')}
                  >
                    {eventLabel(log.event_type)}
                  </span>
                  <p className="mt-2 text-xs [overflow-wrap:anywhere] text-slate-500">
                    {log.client_ip || 'IP 정보 없음'}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    aria-label={`${displayAccount(log)} 접속 상세 보기`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                    onClick={() => setSelected(log)}
                  >
                    보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <ModalDialog
          title="접속 로그 상세"
          size="lg"
          onClose={() => setSelected(null)}
          footer={
            <ModalButton onClick={() => setSelected(null)}>닫기</ModalButton>
          }
        >
          <dl className="grid gap-4 text-sm">
            {[
              ['접속 시각', formatDateTime(selected.created_at)],
              ['계정', displayAccount(selected)],
              [
                '계정 유형',
                `${accountScopeLabel(selected.account_scope)} · ${roleLabel(selected.actor_role)}`,
              ],
              ['대회', contestLabel(selected)],
              ['참가팀', selected.team_name || '—'],
              ['접속 내용', eventLabel(selected.event_type)],
              ['IP 주소', selected.client_ip || '—'],
              ['브라우저 정보', selected.user_agent || '—'],
              ['요청 ID', selected.request_id || '—'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid min-w-0 gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <dt className="font-medium text-slate-500">{label}</dt>
                <dd className="m-0 [overflow-wrap:anywhere] text-slate-900">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {detailsJson(selected.details) ? (
            <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap">
              {detailsJson(selected.details)}
            </pre>
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
