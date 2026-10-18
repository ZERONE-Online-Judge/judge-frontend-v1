import type { Rejudging, RejudgingDetail, RejudgingTarget } from './rejudging';
import type { RejudgingNotificationPage } from './rejudgingNotifications';
import type {
  OperatorScoreboardResponse,
  OperatorPresentationScoreboardResponse,
  ScoreboardResponse,
  ScoreboardRelease,
  ScoreboardReleaseAction,
  Submission,
  SubmissionCreateRequest,
  SubmissionKindFilter,
} from '@/domains/submissionScoreboard/types';
import { apiPageRequest, apiRequest } from '@/shared/api/client';

function notificationSearch(contestId?: string, offset?: number) {
  const search = new URLSearchParams();
  if (contestId) search.set('contest_id', contestId);
  if (offset) search.set('offset', String(offset));
  return search.size ? `?${search}` : '';
}

export function getRejudgingNotifications(
  token: string,
  contestId?: string,
  offset = 0,
) {
  return apiRequest<RejudgingNotificationPage>(
    `/notifications/rejudging${notificationSearch(contestId, offset)}`,
    token,
  );
}

export function updateRejudgingNotification(
  token: string,
  notificationId: string,
  action: 'read' | 'delete',
  contestId?: string,
) {
  return apiRequest<{ notification_id: string }>(
    `/notifications/rejudging/${encodeURIComponent(notificationId)}${action === 'read' ? '/read' : ''}${notificationSearch(contestId)}`,
    token,
    { method: action === 'read' ? 'POST' : 'DELETE' },
  );
}

export type OperatorSubmissionFilters = {
  problems: {
    problem_id: string;
    problem_code: string;
    title: string;
    division_id: string;
  }[];
  teams: {
    participant_team_id: string;
    team_name: string;
    division_id: string;
  }[];
};

export function getOperatorSubmissionFilters(contestId: string, token: string) {
  return apiRequest<OperatorSubmissionFilters>(
    `/operator/contests/${contestId}/submission-filters`,
    token,
  );
}

export function createSubmission(
  contestId: string,
  problemId: string,
  token: string,
  body: SubmissionCreateRequest,
) {
  return apiRequest<Submission>(
    `/contests/${contestId}/problems/${problemId}/submissions`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function listSubmissions(
  contestId: string,
  token?: string,
  options: { divisionId?: string } = {},
) {
  const search = new URLSearchParams();
  if (options.divisionId) search.set('division_id', options.divisionId);
  const query = search.toString();

  return apiRequest<Submission[]>(
    `/contests/${contestId}/submissions${query ? `?${query}` : ''}`,
    token,
  );
}

export function listSubmissionsPage(
  contestId: string,
  token: string | undefined,
  options: {
    cursor?: string;
    divisionId?: string;
    includeSource?: boolean;
    limit?: number;
    problemId?: string;
  } = {},
) {
  const search = new URLSearchParams();
  if (options.limit) search.set('limit', String(options.limit));
  if (options.cursor) search.set('cursor', options.cursor);
  if (options.divisionId) search.set('division_id', options.divisionId);
  if (options.includeSource) search.set('include_source', 'true');
  if (options.problemId) search.set('problem_id', options.problemId);

  const query = search.toString();
  return apiPageRequest<Submission[]>(
    `/contests/${contestId}/submissions${query ? `?${query}` : ''}`,
    token,
  );
}

export function getSubmission(
  contestId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<Submission>(
    `/contests/${contestId}/submissions/${submissionId}`,
    token,
  );
}

export function waitSubmissionStatus(
  contestId: string,
  submissionId: string,
  token: string,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 4),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.5),
  });

  return apiRequest<Submission>(
    `/contests/${contestId}/submissions/${submissionId}/status:wait?${search}`,
    token,
  );
}

export function createMockSubmission(
  contestId: string,
  problemId: string,
  token: string | undefined,
  body: SubmissionCreateRequest,
) {
  return apiRequest<Submission>(
    `/contests/${contestId}/problems/${problemId}/mock-submissions`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function waitMockSubmissionStatus(
  contestId: string,
  submissionId: string,
  token: string | undefined,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 1),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.15),
  });

  return apiRequest<Submission>(
    `/contests/${contestId}/mock-submissions/${submissionId}/status:wait?${search}`,
    token,
  );
}

export function getScoreboard(contestId: string, token?: string) {
  return apiRequest<ScoreboardResponse>(
    `/contests/${contestId}/scoreboard`,
    token,
  );
}

export function waitScoreboard(
  contestId: string,
  token: string | undefined,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 4),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.5),
  });

  return apiRequest<ScoreboardResponse>(
    `/contests/${contestId}/scoreboard:wait?${search}`,
    token,
  );
}

export function getDivisionScoreboard(
  contestId: string,
  divisionId: string,
  token?: string,
) {
  return apiRequest<ScoreboardResponse>(
    `/contests/${contestId}/divisions/${divisionId}/scoreboard`,
    token,
  );
}

export function waitDivisionScoreboard(
  contestId: string,
  divisionId: string,
  token: string | undefined,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 4),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.5),
  });

  return apiRequest<ScoreboardResponse>(
    `/contests/${contestId}/divisions/${divisionId}/scoreboard:wait?${search}`,
    token,
  );
}

export function listOperatorSubmissions(contestId: string, token: string) {
  return apiRequest<Submission[]>(
    `/operator/contests/${contestId}/submissions`,
    token,
  );
}

export function listOperatorSubmissionsPage(
  contestId: string,
  token: string,
  options: {
    cursor?: string;
    divisionId?: string;
    limit?: number;
    problemId?: string;
    teamId?: string;
    submissionKind?: Exclude<SubmissionKindFilter, 'all'>;
  } = {},
) {
  const search = new URLSearchParams();
  if (options.limit) search.set('limit', String(options.limit));
  if (options.cursor) search.set('cursor', options.cursor);
  if (options.divisionId) search.set('division_id', options.divisionId);
  if (options.problemId) search.set('problem_id', options.problemId);
  if (options.teamId) search.set('participant_team_id', options.teamId);
  if (options.submissionKind)
    search.set('submission_kind', options.submissionKind);
  const query = search.toString();

  return apiPageRequest<Submission[]>(
    `/operator/contests/${contestId}/submissions${query ? `?${query}` : ''}`,
    token,
  );
}

export function getOperatorSubmission(
  contestId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<Submission>(
    `/operator/contests/${contestId}/submissions/${submissionId}`,
    token,
  );
}

export function waitOperatorSubmissionStatus(
  contestId: string,
  submissionId: string,
  token: string,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 4),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.5),
  });

  return apiRequest<Submission>(
    `/operator/contests/${contestId}/submissions/${submissionId}/status:wait?${search}`,
    token,
  );
}

export function getOperatorScoreboard(contestId: string, token: string) {
  return apiRequest<OperatorScoreboardResponse>(
    `/operator/contests/${contestId}/scoreboard/internal`,
    token,
  );
}

export function getOperatorDivisionScoreboard(
  contestId: string,
  divisionId: string,
  token: string,
) {
  return apiRequest<OperatorScoreboardResponse>(
    `/operator/contests/${contestId}/divisions/${divisionId}/scoreboard/internal`,
    token,
  );
}

export function getOperatorPresentationScoreboard(
  contestId: string,
  token: string,
) {
  return apiRequest<OperatorPresentationScoreboardResponse>(
    `/operator/contests/${contestId}/scoreboard/presentation`,
    token,
  );
}

export function getScoreboardRelease(
  contestId: string,
  divisionId: string,
  token: string,
) {
  return apiRequest<ScoreboardRelease>(
    `/operator/contests/${contestId}/divisions/${divisionId}/scoreboard/release`,
    token,
  );
}

export function updateScoreboardRelease(
  contestId: string,
  divisionId: string,
  token: string,
  body: ScoreboardReleaseAction,
) {
  return apiRequest<ScoreboardRelease>(
    `/operator/contests/${contestId}/divisions/${divisionId}/scoreboard/release`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function listAdminJudgeSubmissionsPage(
  token: string,
  options: { limit?: number; cursor?: string; includeSource?: boolean } = {},
) {
  const search = new URLSearchParams();
  if (options.limit) search.set('limit', String(options.limit));
  if (options.cursor) search.set('cursor', options.cursor);
  search.set('include_source', String(options.includeSource ?? false));

  return apiPageRequest<Submission[]>(
    `/admin/judge/submissions?${search}`,
    token,
  );
}

export function createOperatorTestSubmission(
  contestId: string,
  problemId: string,
  token: string,
  body: SubmissionCreateRequest & { verification_asset_id?: string },
) {
  return apiRequest<Submission>(
    `/operator/contests/${contestId}/problems/${problemId}/test-submissions`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function waitOperatorTestSubmissionStatus(
  contestId: string,
  submissionId: string,
  token: string,
  options: { waitSeconds?: number; pollIntervalSeconds?: number } = {},
) {
  const search = new URLSearchParams({
    wait_seconds: String(options.waitSeconds ?? 1),
    poll_interval_seconds: String(options.pollIntervalSeconds ?? 0.1),
  });

  return apiRequest<Submission>(
    `/operator/contests/${contestId}/test-submissions/${submissionId}/status:wait?${search}`,
    token,
  );
}

export function rejudgeSystemError(
  contestId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<Submission>(
    `/operator/contests/${contestId}/submissions/${submissionId}/rejudge`,
    token,
    { method: 'POST' },
  );
}

function rejudgingPath(contestId: string) {
  return `/operator/contests/${contestId}/rejudgings`;
}
export function createRejudging(
  contestId: string,
  token: string,
  target: RejudgingTarget,
  reason: string,
) {
  return apiRequest<Rejudging>(rejudgingPath(contestId), token, {
    method: 'POST',
    body: JSON.stringify({ ...target, reason }),
  });
}
export function listRejudgings(contestId: string, token: string, offset = 0) {
  return apiRequest<{ batches: Rejudging[]; total: number }>(
    `${rejudgingPath(contestId)}?offset=${offset}&limit=10`,
    token,
  );
}
export function getRejudging(
  contestId: string,
  token: string,
  id: string,
  offset = 0,
) {
  return apiRequest<RejudgingDetail>(
    `${rejudgingPath(contestId)}/${id}?offset=${offset}&limit=50`,
    token,
  );
}
export function decideRejudging(
  contestId: string,
  token: string,
  id: string,
  action: 'apply' | 'cancel',
) {
  return apiRequest<Rejudging>(
    `${rejudgingPath(contestId)}/${id}/${action}`,
    token,
    {
      method: 'POST',
    },
  );
}
