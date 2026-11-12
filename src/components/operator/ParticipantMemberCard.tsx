import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { TeamMember } from '@/domains/teamParticipation/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import SessionEnvironment from '@/shared/ui/SessionEnvironment';
import SessionPlatformIcon from './SessionPlatformIcon';
import './ParticipantRoster.css';

export default function ParticipantMemberCard({
  member,
  pending,
  onRevoke,
  canRevoke = true,
  teamBlocked = false,
  teamWithdrawn = false,
  canManageAccess = false,
  onAccess,
}: {
  member: TeamMember;
  pending: boolean;
  onRevoke: () => void;
  canRevoke?: boolean;
  teamBlocked?: boolean;
  teamWithdrawn?: boolean;
  canManageAccess?: boolean;
  onAccess?: () => void;
}) {
  const active = (member.active_sessions ?? 0) > 0;
  const sessions = active
    ? [...(member.sessions ?? [])].sort((a, b) =>
        b.issued_at.localeCompare(a.issued_at),
      )
    : [];
  const lastUsed = member.last_session_seen_at || member.last_login_at;
  const sessionKey = sessions.length
    ? sessions
        .map((session) => `${session.scope}/${session.issued_at}`)
        .join('|')
    : member.last_login_at || 'legacy';
  const fields = (
    <>
      <div className="participant-member-name">
        <span className="participant-member-full-name">{member.name}</span>
        <span
          className={[
            'participant-member-role',
            member.role === 'leader' ? 'is-leader' : '',
          ].join(' ')}
        >
          {member.role === 'leader' ? '팀장' : '팀원'}
        </span>
        {teamWithdrawn ? (
          <span
            className="participant-access-badge is-withdrawn"
            title="소속 팀의 기권으로 이 대회 접근이 차단되었습니다."
          >
            기권팀
          </span>
        ) : null}
        {member.access_blocked || teamBlocked ? (
          <span
            className="participant-access-badge is-blocked"
            title={member.access_block_reason || undefined}
          >
            {member.access_blocked
              ? teamBlocked
                ? '개인·팀 차단'
                : '개인 차단'
              : '팀 차단 적용'}
          </span>
        ) : null}
      </div>
      <span className="participant-member-email">{member.email}</span>
      <div className="participant-member-session">
        <span
          className={[
            'participant-member-status',
            active ? 'is-active' : '',
          ].join(' ')}
        >
          {active ? (
            <>
              <span className="participant-session-dot" aria-hidden="true" />
              활성 세션
              <SessionPlatformIcon environment={sessions[0]?.environment} />
            </>
          ) : (
            '세션 없음'
          )}
        </span>
        <span className="participant-member-last-used">
          <span className="sr-only">마지막 사용 </span>
          {lastUsed ? formatDateTime(lastUsed) : '기록 없음'}
        </span>
      </div>
    </>
  );

  return (
    <li className="participant-member">
      <div className="participant-member-body">
        {active ? (
          <details className="participant-member-disclosure" key={sessionKey}>
            <summary
              className="participant-member-row"
              title={`${member.name} 세션 상세`}
            >
              {fields}
              <span className="participant-member-chevron" aria-hidden="true">
                <InterfaceIcon name="chevronDown" size={18} />
              </span>
            </summary>
            <div className="participant-member-detail">
              <div className="participant-member-environments">
                {sessions.length ? (
                  sessions.map((session, index) => (
                    <div
                      className="participant-member-environment"
                      key={`${session.scope}/${session.issued_at}/${index}`}
                    >
                      <SessionEnvironment environment={session.environment} />
                      <span className="participant-member-login-time">
                        로그인 {formatDateTime(session.issued_at)}
                      </span>
                    </div>
                  ))
                ) : (
                  <span>환경 정보 없음</span>
                )}
              </div>
              {canRevoke && member.team_member_id ? (
                <button
                  className="participant-member-logout"
                  disabled={pending}
                  title="이 계정의 모든 기기에서 로그아웃합니다"
                  onClick={onRevoke}
                  type="button"
                >
                  {pending ? '로그아웃 중…' : '계정 로그아웃'}
                </button>
              ) : null}
            </div>
          </details>
        ) : (
          <div className="participant-member-row">
            {fields}
            <span aria-hidden="true" />
          </div>
        )}
      </div>
      {canManageAccess && member.team_member_id && onAccess ? (
        <div className="participant-member-access-actions">
          <button
            type="button"
            className={member.access_blocked ? 'is-restore' : ''}
            disabled={pending}
            onClick={onAccess}
            aria-label={`${member.name} 개인 ${member.access_blocked ? '차단 해제' : '접근 차단'}`}
          >
            {member.access_blocked ? '개인 차단 해제' : '개인 차단'}
          </button>
        </div>
      ) : null}
    </li>
  );
}
