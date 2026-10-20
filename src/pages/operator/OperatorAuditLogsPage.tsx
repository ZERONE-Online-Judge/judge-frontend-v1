import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import AccessLogTable from '@/components/audit/AccessLogTable';
import MailDeliveryLogPanel from '@/components/audit/MailDeliveryLogPanel';
import OperationalAuditLogTable from '@/components/audit/OperationalAuditLogTable';
import PageLayout from '@/components/common/PageLayout';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import { sharedUiText } from '@/data/uiText';
import {
  getOperatorAccessLogStats,
  listOperatorAccessLogs,
  listOperatorOperationalAuditLogs,
} from '@/domains/auditMonitoring/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import { formatApiError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';

const AUDIT_LOG_PAGE_SIZE = 50;

export default function OperatorAuditLogsPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission={['contest.audit.view', 'contest.access_log.view']}
    >
      {(session) =>
        contestId ? (
          <OperatorAuditLogsContent
            contestId={contestId}
            token={session.accessToken}
            canViewOperations={hasContestPermission(
              session,
              contestId,
              'contest.audit.view',
            )}
            canViewAccess={hasContestPermission(
              session,
              contestId,
              'contest.access_log.view',
            )}
          />
        ) : (
          <PageLayout
            variant="management"
            title={sharedUiText.contestSelectionRequiredTitle}
          >
            {sharedUiText.contestSelectionRequiredBody}
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorAuditLogsContent({
  contestId,
  token,
  canViewOperations,
  canViewAccess,
}: {
  contestId: string;
  token: string;
  canViewOperations: boolean;
  canViewAccess: boolean;
}) {
  const isVisible = useDocumentVisibility();
  const queryIdentity = tokenQueryIdentity(token);
  const [selectedLogType, setLogType] = useState<
    'operations' | 'access' | 'email'
  >('operations');
  const logType = !canViewOperations
    ? 'access'
    : selectedLogType === 'access' && !canViewAccess
      ? 'operations'
      : selectedLogType;
  const [actorDraft, setActorDraft] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [],
  );
  const [accessCursor, setAccessCursor] = useState<string | undefined>();
  const [accessCursorHistory, setAccessCursorHistory] = useState<
    Array<string | undefined>
  >([]);

  const auditLogsQuery = useQuery({
    enabled: canViewOperations && logType === 'operations',
    queryKey: [
      'operator',
      'audit-logs',
      contestId,
      actorFilter || 'all-actors',
      cursor ?? 'first',
      queryIdentity,
    ],
    queryFn: () =>
      listOperatorOperationalAuditLogs(contestId, token, {
        actorEmail: actorFilter || undefined,
        cursor,
        limit: AUDIT_LOG_PAGE_SIZE,
      }),
    refetchInterval: isVisible ? 10_000 : false,
    placeholderData: keepPreviousData,
  });

  const accessLogsQuery = useQuery({
    queryKey: [
      'operator',
      'access-logs',
      contestId,
      actorFilter || 'all-accounts',
      accessCursor ?? 'first',
      queryIdentity,
    ],
    queryFn: () =>
      listOperatorAccessLogs(contestId, token, {
        cursor: accessCursor,
        email: actorFilter || undefined,
        limit: AUDIT_LOG_PAGE_SIZE,
      }),
    enabled: canViewAccess && logType === 'access',
    refetchInterval: isVisible && logType === 'access' ? 10_000 : false,
    placeholderData: keepPreviousData,
  });

  const accessStatsQuery = useQuery({
    queryKey: ['operator', 'access-log-stats', contestId, queryIdentity],
    queryFn: () => getOperatorAccessLogStats(contestId, token),
    enabled: canViewAccess && logType === 'access',
    refetchInterval: isVisible && logType === 'access' ? 10_000 : false,
  });

  const logs = auditLogsQuery.data?.data ?? [];
  const page = auditLogsQuery.data?.page;
  const nextCursor = page?.next_cursor ?? null;
  const accessLogs = accessLogsQuery.data?.data ?? [];
  const accessPage = accessLogsQuery.data?.page;
  const accessNextCursor = accessPage?.next_cursor ?? null;
  const accessStats = accessStatsQuery.data;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActorFilter(actorDraft.trim().toLowerCase());
    setCursor(undefined);
    setCursorHistory([]);
    setAccessCursor(undefined);
    setAccessCursorHistory([]);
  }

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      description={
        canViewOperations
          ? '이 대회의 변경 작업, 접속 기록과 이메일 발송 기록을 확인합니다.'
          : '이 대회 참가자와 운영자의 접속 기록을 확인합니다.'
      }
      eyebrow="Operator Audit"
      title="운영 로그"
      width="full"
    >
      <OperatorPanel
        description={
          logType === 'email'
            ? '수신자, 이메일 제목, 발송 상태와 시각을 확인합니다.'
            : logType === 'operations'
              ? '대회 설정, 공지, 게시판, 참가팀, 문제, 채점 관련 변경 작업이 기록됩니다.'
              : '이 대회 참가자의 로그인, 세션 발급, 세션 유지 흐름을 확인합니다.'
        }
        title={
          logType === 'email'
            ? '이메일 발송 기록'
            : logType === 'operations'
              ? '대회 작업 기록'
              : '대회 접속 기록'
        }
        actions={
          logType !== 'email' ? (
            <button
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              onClick={() =>
                logType === 'operations'
                  ? auditLogsQuery.refetch()
                  : accessLogsQuery.refetch()
              }
              type="button"
            >
              새로고침
            </button>
          ) : undefined
        }
      >
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {[
            ['operations', '작업 로그'],
            ['access', '접속 로그'],
            ['email', '이메일 발송 로그'],
          ]
            .filter(([value]) =>
              value === 'access' ? canViewAccess : canViewOperations,
            )
            .map(([value, label]) => (
              <button
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  logType === value
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800',
                ].join(' ')}
                key={value}
                onClick={() =>
                  setLogType(value as 'operations' | 'access' | 'email')
                }
                type="button"
              >
                {label}
              </button>
            ))}
        </div>
        {logType === 'email' ? (
          <MailDeliveryLogPanel
            key={contestId}
            token={token}
            contestId={contestId}
          />
        ) : (
          <>
            <form
              className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={applyFilters}
            >
              <input
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                onChange={(event) => setActorDraft(event.target.value)}
                aria-label="계정 이메일로 필터"
                placeholder="계정 이메일로 필터"
                value={actorDraft}
              />
              <button
                className="h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-800"
                type="submit"
              >
                필터 적용
              </button>
            </form>
            {logType === 'access' ? (
              <p className="text-xs leading-5 text-slate-600">
                운영자 접속은 대회 화면의 인증된 요청을 기준으로 기록합니다.
                같은 세션·IP의 반복 접속은 30분마다 한 번 기록합니다. 활성 세션
                수는 참가자 세션 기준입니다.
              </p>
            ) : null}
            {logType === 'access' && accessStats ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  ['최근 24시간', accessStats.total_count],
                  ['성공/유지', accessStats.success_count],
                  ['로그인 실패', accessStats.failed_count],
                  ['중복 세션', accessStats.conflict_count],
                  ['고유 계정', accessStats.unique_account_count],
                  ['활성 세션', accessStats.active_session_count],
                ].map(([label, value]) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                    key={label}
                  >
                    <div className="text-xs font-semibold text-slate-600">
                      {label}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">
                      {Number(value).toLocaleString('ko-KR')}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {logType === 'operations' && auditLogsQuery.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {formatApiError(
                  auditLogsQuery.error,
                  '운영 로그를 불러오지 못했습니다',
                )}
              </div>
            ) : null}
            {logType === 'access' && accessLogsQuery.error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {formatApiError(
                  accessLogsQuery.error,
                  '접속 로그를 불러오지 못했습니다',
                )}
              </div>
            ) : null}
            {logType === 'operations' ? (
              <OperationalAuditLogTable
                loading={auditLogsQuery.isFetching}
                logs={logs}
              />
            ) : (
              <AccessLogTable
                loading={accessLogsQuery.isFetching}
                logs={accessLogs}
                showContest={false}
              />
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-600">
              {logType === 'operations' ? (
                <span>
                  전체 {page?.total_count ?? logs.length}건 중 {logs.length}건
                  표시
                </span>
              ) : (
                <span>
                  전체 {accessPage?.total_count ?? accessLogs.length}건 중{' '}
                  {accessLogs.length}건 표시
                </span>
              )}
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    logType === 'operations'
                      ? cursorHistory.length === 0
                      : accessCursorHistory.length === 0
                  }
                  onClick={() => {
                    if (logType === 'operations') {
                      const previous = [...cursorHistory];
                      const next = previous.pop();
                      setCursor(next);
                      setCursorHistory(previous);
                      return;
                    }
                    const previous = [...accessCursorHistory];
                    const next = previous.pop();
                    setAccessCursor(next);
                    setAccessCursorHistory(previous);
                  }}
                  type="button"
                >
                  이전
                </button>
                <button
                  className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    logType === 'operations' ? !nextCursor : !accessNextCursor
                  }
                  onClick={() => {
                    if (logType === 'operations') {
                      setCursorHistory((history) => [...history, cursor]);
                      setCursor(nextCursor ?? undefined);
                      return;
                    }
                    setAccessCursorHistory((history) => [
                      ...history,
                      accessCursor,
                    ]);
                    setAccessCursor(accessNextCursor ?? undefined);
                  }}
                  type="button"
                >
                  다음
                </button>
              </div>
            </footer>
          </>
        )}
      </OperatorPanel>
    </PageLayout>
  );
}
