import {
  sessionEnvironmentLabel,
  type SessionDescription,
  type SessionEnvironmentData,
} from '@/shared/lib/sessionEnvironment';
import { formatDateTime } from '@/shared/lib/dateTime';

export default function SessionEnvironment({
  environment,
  className = '',
}: {
  environment?: SessionEnvironmentData | null;
  className?: string;
}) {
  return (
    <span className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>
      {sessionEnvironmentLabel(environment)}
    </span>
  );
}

function sessionTime(value?: string | null) {
  return value && Number.isFinite(new Date(value).getTime())
    ? formatDateTime(value)
    : '시각 정보 없음';
}

export function SessionDescriptionList({
  sessions,
  emptyText = '활성 세션이 없습니다.',
  showExpiry = false,
}: {
  sessions?: SessionDescription[];
  emptyText?: string;
  showExpiry?: boolean;
}) {
  if (!sessions?.length)
    return <p className="text-xs text-slate-500">{emptyText}</p>;
  const scopes = {
    general: '일반 계정',
    staff: '운영진',
    participant: '참가자',
  };
  return (
    <ul className="grid min-w-0 gap-2" aria-label="활성 로그인 세션">
      {sessions.map((session, index) => (
        <li
          key={`${session.scope}/${session.issued_at}/${index}`}
          className="grid min-w-0 gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs [overflow-wrap:anywhere]"
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <SessionEnvironment
              environment={session.environment}
              className="font-semibold text-slate-800"
            />
            <span className="text-slate-500">{scopes[session.scope]}</span>
          </div>
          <p className="text-slate-600">
            마지막 사용 {sessionTime(session.last_seen_at || session.issued_at)}
          </p>
          <p className="text-slate-500">
            로그인 {sessionTime(session.issued_at)}
            {showExpiry ? ` · 만료 ${sessionTime(session.expires_at)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
