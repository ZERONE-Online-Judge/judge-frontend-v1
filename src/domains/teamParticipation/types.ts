import type { Contest, Division } from '@/domains/contestAdministration/types';
import type { SessionDescription } from '@/shared/lib/sessionEnvironment';

export type TeamMemberRole = 'leader' | 'member';

export type ParticipantAccess = {
  access_blocked?: boolean;
  access_block_reason?: string | null;
  access_blocked_at?: string | null;
  access_blocked_by?: string | null;
};

export type TeamMember = ParticipantAccess & {
  team_member_id?: string;
  role: TeamMemberRole;
  name: string;
  email: string;
  active_sessions?: number;
  last_login_at?: string | null;
  last_session_seen_at?: string | null;
  sessions?: SessionDescription[];
};

export type TeamMemberDraft = {
  team_member_id?: string;
  role?: TeamMemberRole;
  name: string;
  email: string;
};

export type ParticipantTeam = ParticipantAccess & {
  participant_team_id: string;
  contest_id: string;
  division_id: string;
  team_name: string;
  status: string;
  withdrawn?: boolean;
  withdrawal_reason?: string | null;
  withdrawn_at?: string | null;
  withdrawn_by?: string | null;
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
  results?: {
    row: number;
    status: 'created' | 'failed';
    participant_team_id?: string;
    team_name?: string;
    warnings?: ParticipantImportIssue[];
  }[];
  errors: {
    row: number;
    team_name: string;
    message: string;
    code?: string;
    field?: string;
    errors?: ParticipantImportIssue[];
  }[];
};

export type ParticipantImportIssue = {
  code: string;
  field: string;
  message: string;
  email?: string;
};
export type ParticipantBulkPreview = {
  rows: {
    row: number;
    team_name: string;
    input: TeamImportRow;
    normalized: TeamImportRow | null;
    valid: boolean;
    errors: ParticipantImportIssue[];
    warnings: ParticipantImportIssue[];
    corrections: {
      field: string;
      before: unknown;
      after: unknown;
      message: string;
    }[];
  }[];
  summary: {
    total: number;
    ready: number;
    invalid: number;
    corrected: number;
    warnings: number;
  };
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
