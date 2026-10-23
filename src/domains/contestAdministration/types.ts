export type ContestStatus =
  | 'draft'
  | 'schedule_tbd'
  | 'scheduled'
  | 'open'
  | 'running'
  | 'ended'
  | 'finalized'
  | 'archived';

export type ContestFormatType =
  | 'wa_ac'
  | 'wa/ac'
  | 'acm'
  | 'icpc'
  | 'score'
  | 'scored'
  | 'score_based'
  | 'points'
  | 'ioi'
  | string;

export type ContestVisibility = 'public' | 'private';
export type ContestResourceAccess = 'private' | 'participants' | 'public';
export type BoardCommentScope = 'all' | 'operators';
export type ScoreboardFreezeMode = 'auto' | 'live' | 'frozen';
export type ScoreboardReleaseMode = 'manual' | 'immediate' | 'resolver';

export type Contest = {
  contest_id: string;
  title: string;
  organization_name: string;
  overview: string;
  status: ContestStatus | string;
  visibility?: ContestVisibility;
  visibility_after_end?: ContestVisibility;
  contest_type?: ContestFormatType | null;
  start_at: string;
  end_at: string;
  freeze_at: string;
  format?: ContestFormatType | null;
  format_type?: ContestFormatType | null;
  problem_access_after_end?: ContestResourceAccess;
  scoring_mode?: ContestFormatType | null;
  scoring_type?: ContestFormatType | null;
  scoreboard_access_after_end?: ContestResourceAccess;
  submission_access_after_end?: ContestResourceAccess;
  board_access_after_end?: ContestResourceAccess;
  board_write_after_end?: boolean;
  board_question_visibility_policy?: 'choice' | ContestVisibility;
  board_question_default_visibility?: ContestVisibility;
  board_comment_scope_policy?: 'choice' | BoardCommentScope;
  board_comment_default_scope?: BoardCommentScope;
  notice_access_after_end?: ContestResourceAccess;
  editorial_access_after_end?: ContestResourceAccess;
  scoreboard_freeze_mode?: ScoreboardFreezeMode;
  scoreboard_release_mode?: ScoreboardReleaseMode;
  scoreboard_release_locked?: boolean;
  mock_judging_enabled?: boolean;
  freeze_submission_count_visible?: boolean;
  participant_progress_visible?: boolean;
  mock_judging_progress_visible?: boolean;
  emergency_notice: string | null;
  emergency_notice_template?: string | null;
};

export type Division = {
  division_id: string;
  code: string;
  name: string;
  description: string;
  display_order?: number;
};

export type PublicHomeReadModel = {
  hero?: unknown;
  active_contest_count?: number;
  emergency_notice?: string | null;
};

export type PublicContestDetail = {
  contest: Contest;
  divisions: Division[];
  participant_count?: number;
  team_count?: number;
};

export type ContestWorkspace = {
  contest: Contest;
  division: Division;
  divisions?: Division[];
  problems: unknown[];
  emergency_notice?: string | null;
};

export type PublicVisibility = {
  problems: boolean;
  scoreboard: boolean;
  submissions: boolean;
};

export type OperatorDashboard = {
  contest: Contest;
  divisions: Division[];
  participant_count: number;
  submission_count: number;
  pending_jobs: number;
  participant_count_by_division: Record<string, number>;
};

export type ContestSettingsPatch = Partial<
  Pick<
    Contest,
    | 'title'
    | 'organization_name'
    | 'overview'
    | 'status'
    | 'visibility'
    | 'visibility_after_end'
    | 'start_at'
    | 'end_at'
    | 'freeze_at'
    | 'problem_access_after_end'
    | 'scoreboard_access_after_end'
    | 'submission_access_after_end'
    | 'board_access_after_end'
    | 'board_write_after_end'
    | 'board_question_visibility_policy'
    | 'board_question_default_visibility'
    | 'board_comment_scope_policy'
    | 'board_comment_default_scope'
    | 'notice_access_after_end'
    | 'editorial_access_after_end'
    | 'scoreboard_freeze_mode'
    | 'scoreboard_release_mode'
    | 'mock_judging_enabled'
    | 'freeze_submission_count_visible'
    | 'participant_progress_visible'
    | 'mock_judging_progress_visible'
    | 'emergency_notice'
  >
>;
