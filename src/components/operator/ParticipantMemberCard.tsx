import type { TeamMember } from '@/domains/teamParticipation/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import { SessionDescriptionList } from '@/shared/ui/SessionEnvironment';
export default function ParticipantMemberCard({
  member,
  pending,
  onRevoke,
}: {
  member: TeamMember;
  pending: boolean;
  onRevoke: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="zoj-break-anywhere min-w-0 font-medium text-slate-800"
          title={member.name}
        >
          {member.name}
        </span>
        <span
          className="zoj-break-anywhere min-w-0 text-xs font-medium text-slate-600"
          title={member.email}
        >
          {member.email}
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
          {member.role === 'leader' ? '팀장' : '팀원'}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
        <span
          className={[
            'rounded-full px-2 py-1 font-semibold',
            (member.active_sessions ?? 0) > 0
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600',
          ].join(' ')}
        >
          {(member.active_sessions ?? 0) > 0
            ? `세션 ${member.active_sessions}개`
            : '세션 없음'}
        </span>
        <span>
          마지막 사용{' '}
          {member.last_session_seen_at
            ? formatDateTime(member.last_session_seen_at)
            : member.last_login_at
              ? formatDateTime(member.last_login_at)
              : '-'}
        </span>
        {member.team_member_id && (member.active_sessions ?? 0) > 0 ? (
          <button
            className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
            disabled={pending}
            title="이 계정의 모든 기기에서 로그아웃합니다"
            onClick={onRevoke}
            type="button"
          >
            계정 로그아웃
          </button>
        ) : null}
      </div>
      {(member.active_sessions ?? 0) > 0 ? (
        <div className="mt-1">
          <SessionDescriptionList
            sessions={member.sessions}
            emptyText="환경 정보 없음"
          />
          {member.sessions?.length &&
          (member.active_sessions ?? 0) > member.sessions.length ? (
            <p className="mt-1 text-xs text-slate-500">
              최근 세션 {member.sessions.length}개 표시
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
