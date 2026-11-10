import type { Contest, Division } from '@/domains/contestAdministration/types';
import type { Submission } from '@/domains/submissionScoreboard/types';
import type { SessionEnvironmentData } from '@/shared/lib/sessionEnvironment';
import type {
  ParticipantTeam,
  TeamMember,
} from '@/domains/teamParticipation/types';

export type JudgeStatus = {
  active_node_count: number;
};

export type AdminJudgeDashboard = {
  nodes: Array<{
    judge_node_id: string;
    node_name: string;
    total_slots: number;
    free_slots: number;
    running_job_count: number;
    reported_running_job_count?: number | null;
    actual_running_job_count?: number | null;
    running_job_count_mismatch?: boolean | null;
    agent_version?: string | null;
    last_heartbeat_at: string;
    schedulable: boolean;
    allow_zoj?: boolean;
    allow_editor?: boolean;
    execution_capabilities?: string[];
    execution_revision?: string | null;
    is_active: boolean;
    heartbeat_age_seconds: number;
  }>;
  queue: Array<{
    judge_job_id: string;
    submission_id: string;
    contest_id: string;
    division_id: string;
    status: string;
    queue_position: number;
    assigned_node_id?: string | null;
    leased_at?: string | null;
    created_at: string;
  }>;
  queue_stats?: {
    pending_count: number;
    running_count: number;
    succeeded_count: number;
    editor_pending_count?: number;
    editor_running_count?: number;
  };
};

export type AdminJudgeNode = AdminJudgeDashboard['nodes'][number];

export type AdminJudgeAgentLog = {
  judge_agent_log_id: string;
  judge_node_id: string;
  node_name: string;
  level: string;
  message: string;
  created_at: string;
};

export type OperationalAuditLog = {
  operational_audit_log_id: string;
  scope: 'admin' | 'operator' | string;
  action: string;
  method: string;
  path: string;
  status_code: number;
  actor_email?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  contest_id?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  environment?: SessionEnvironmentData | null;
  request_id?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};

export type MailDeliveryLog = {
  mail_queue_id: string;
  body_preview?: string | null;
  preview_restricted?: boolean;
  contest_id: string | null;
  contest_title: string | null;
  mail_type: string;
  recipient_email: string;
  subject: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
};

export type MailLogFilters = {
  q?: string;
  status?: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
};

export type AccessLog = {
  access_log_id: string;
  event_type: string;
  account_scope: string;
  email?: string | null;
  display_name?: string | null;
  contest_id?: string | null;
  contest_title?: string | null;
  participant_team_id?: string | null;
  team_name?: string | null;
  team_member_id?: string | null;
  member_name?: string | null;
  actor_role?: string | null;
  session_id?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  environment?: SessionEnvironmentData | null;
  request_id?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};

export type MailUsageStatus = 'ok' | 'error' | 'not_configured' | 'unsupported';

export type MailUsageQuota = {
  sent: number;
  received: number;
  used: number;
  limit: number | null;
  resets_at: string | null;
};

export type AdminMailUsage = {
  provider: string;
  generated_at: string;
  quota: {
    status: MailUsageStatus;
    daily: MailUsageQuota | null;
    monthly: MailUsageQuota | null;
    message: string | null;
  };
  weekly: {
    status: MailUsageStatus;
    sent: number | null;
    start_at: string | null;
    end_at: string | null;
    message: string | null;
  };
  metrics_delay_minutes: number;
};

export type AccessLogStats = {
  window_hours: number;
  total_count: number;
  success_count: number;
  failed_count: number;
  conflict_count: number;
  unique_account_count: number;
  active_session_count: number;
};

export type AdminJudgeSubmissionEntry = {
  submission: Submission;
  contest?: Pick<Contest, 'contest_id' | 'title'> | null;
  division?: Pick<Division, 'division_id' | 'name'> | null;
  problem?: {
    problem_id: string;
    problem_code: string;
    title: string;
    time_limit_ms: number;
    memory_limit_mb: number;
  } | null;
  team?: Pick<ParticipantTeam, 'participant_team_id' | 'team_name'> | null;
  member?: Pick<TeamMember, 'team_member_id' | 'name' | 'email'> | null;
  judge_job?: {
    judge_job_id: string;
    status: string;
    queue_position: number;
    assigned_node_id?: string | null;
    created_at: string;
  } | null;
  judge_node?: {
    judge_node_id: string;
    node_name: string;
    total_slots: number;
    free_slots: number;
    running_job_count: number;
    reported_running_job_count?: number | null;
    actual_running_job_count?: number | null;
    running_job_count_mismatch?: boolean | null;
    agent_version?: string | null;
    last_heartbeat_at: string;
    schedulable: boolean;
    allow_zoj?: boolean;
    allow_editor?: boolean;
    execution_capabilities?: string[];
    execution_revision?: string | null;
  } | null;
  active_testcase_count: number;
};
