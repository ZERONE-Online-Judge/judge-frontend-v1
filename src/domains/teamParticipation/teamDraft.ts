import type { TeamMember } from '@/domains/teamParticipation/types';

export type ParticipantTeamFormValue = {
  divisionId: string;
  leaderEmail: string;
  leaderName: string;
  status: string;
  teamName: string;
};

export function participantTeamDraftError(
  value: ParticipantTeamFormValue,
  members: TeamMember[],
) {
  if (!value.teamName.trim() || !value.divisionId)
    return '팀명과 참가 유형을 입력해야 합니다.';
  if (!value.leaderName.trim() || !value.leaderEmail.trim())
    return '팀장 이름과 이메일이 필요합니다.';
  if (
    members.some(
      (member) =>
        (Boolean(member.team_member_id) &&
          (!member.name.trim() || !member.email.trim())) ||
        Boolean(member.name.trim()) !== Boolean(member.email.trim()),
    )
  )
    return '팀원의 이름과 이메일을 모두 입력해야 합니다.';
  return '';
}
