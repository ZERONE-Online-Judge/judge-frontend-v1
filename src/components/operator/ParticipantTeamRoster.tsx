import type {
  ParticipantTeam,
  TeamMember,
} from '@/domains/teamParticipation/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import ParticipantMemberCard from './ParticipantMemberCard';

const statusLabels: Record<string, string> = {
  active: '활성',
  disabled: '비활성',
  disqualified: '실격',
};

export default function ParticipantTeamRoster({
  team,
  divisionName,
  pending,
  canManage,
  onEdit,
  onDelete,
  onRevoke,
}: {
  team: ParticipantTeam;
  divisionName: string;
  pending: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRevoke: (member: TeamMember) => void;
}) {
  const members = [...team.members].sort(
    (a, b) => Number(b.role === 'leader') - Number(a.role === 'leader'),
  );
  return (
    <section className="participant-team-roster" aria-label={team.team_name}>
      <div className="participant-roster-heading">
        <div className="participant-roster-team">
          <div className="participant-roster-team-title">
            <h3>{team.team_name}</h3>
            <span className={`participant-team-status is-${team.status}`}>
              {statusLabels[team.status] ?? team.status}
            </span>
          </div>
          <p className="participant-roster-meta">
            <span>{divisionName}</span>
            <span>구성원 {members.length}명</span>
            <span className="participant-roster-registered">
              등록 {formatDateTime(team.created_at)}
            </span>
          </p>
        </div>
        {canManage ? (
          <div className="participant-roster-actions">
            <button type="button" onClick={onEdit}>
              팀/팀원 편집
            </button>
            <button type="button" className="is-destructive" onClick={onDelete}>
              삭제
            </button>
          </div>
        ) : null}
      </div>
      <div className="participant-roster-columns" aria-hidden="true">
        <span>이름 · 역할</span>
        <span>이메일</span>
        <span>세션 · 마지막 사용</span>
        <span />
      </div>
      <ul className="participant-roster-members" aria-label="팀 구성원">
        {members.map((member) => (
          <ParticipantMemberCard
            key={member.team_member_id ?? member.email}
            member={member}
            pending={pending}
            canRevoke={canManage}
            onRevoke={() => onRevoke(member)}
          />
        ))}
      </ul>
    </section>
  );
}
