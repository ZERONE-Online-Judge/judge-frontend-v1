import type { Contest, Division } from '@/domains/contestAdministration/types';

export type TeamMemberRole = 'leader' | 'member';

export type TeamMember = {
  team_member_id?: string;
  role: TeamMemberRole;
  name: string;
  email: string;
  active_sessions?: number;
  last_login_at?: string | null;
  last_session_seen_at?: string | null;
};

export type TeamMemberDraft = {
  team_member_id?: string;
  role?: TeamMemberRole;
  name: string;
  email: string;
};

export type ParticipantTeam = {
  participant_team_id: string;
  contest_id: string;
  division_id: string;
  team_name: string;
  status: string;
  members: TeamMember[];
  division?: Division | null;
  created_at: string;
};

export type ParticipantSession = {
  isPreview?: boolean;
  accessToken: string;
  contestId: string;
  team: {
    team_name: string;
    participant_team_id?: string;
    members?: TeamMember[];
  };
  member: {
    name: string;
    email: string;
    team_member_id?: string;
    role?: TeamMemberRole;
  };
  division: Division;
};

export type ParticipantBulkImportResponse = {
  created: ParticipantTeam[];
  errors: { row: number; team_name: string; message: string }[];
};

export type ParticipantOtpRequestResponse = {
  sent: boolean;
  delivery: string;
  cooldown_seconds: number;
  demo_otp?: string;
};

export type ParticipantSessionApi = {
  is_preview?: boolean;
  access_token: string;
  team: ParticipantSession['team'];
  member: ParticipantSession['member'];
  division: Division;
  workspace_path?: string;
};

export type GeneralParticipantContest = {
  contest: Contest;
  team: ParticipantTeam;
  member: TeamMember;
  division: Division;
};

export type TeamImportRow = {
  team_name: string;
  division_id: string;
  leader: {
    name: string;
    email: string;
  };
  members: TeamMemberDraft[];
};
