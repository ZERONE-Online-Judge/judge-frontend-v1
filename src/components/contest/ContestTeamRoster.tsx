import type { TeamMember } from '@/domains/teamParticipation/types';
import './ContestTeamRoster.css';

export default function ContestTeamRoster({
  teamName,
  divisionName,
  members,
  currentEmail,
  currentName,
}: {
  teamName: string;
  divisionName: string;
  members?: TeamMember[];
  currentEmail: string;
  currentName: string;
}) {
  const roster = members?.length
    ? members
    : [{ name: currentName, email: currentEmail, role: 'member' as const }];
  return (
    <article
      className="zoj-card zoj-overview-card contest-team-roster"
      aria-label="내 팀과 팀원"
    >
      <div className="contest-team-roster-heading">
        <div>
          <span>{divisionName}</span>
          <h2>{teamName}</h2>
        </div>
        {members?.length ? (
          <span className="contest-team-roster-count">{members.length}명</span>
        ) : null}
      </div>
      <ul>
        {roster.map((member) => {
          const isMe =
            member.email.trim().toLowerCase() ===
            currentEmail.trim().toLowerCase();
          return (
            <li key={member.team_member_id ?? member.email} data-me={isMe}>
              <span className="contest-team-roster-avatar" aria-hidden="true">
                {member.name.slice(0, 1)}
              </span>
              <strong>{member.name}</strong>
              {member.role === 'leader' ? (
                <span className="contest-team-roster-role">팀장</span>
              ) : null}
              {isMe ? <span className="contest-team-roster-me">나</span> : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
