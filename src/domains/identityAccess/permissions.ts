import type {
  GeneralSession,
  StaffSession,
} from '@/domains/identityAccess/types';

export type ContestPermissionCode =
  | 'contest.view'
  | 'contest.participant.preview'
  | 'contest.settings.manage'
  | 'contest.staff.view'
  | 'contest.staff.manage'
  | 'contest.audit.view'
  | 'contest.access_log.view'
  | 'contest.problem.review'
  | 'contest.problem.test'
  | 'contest.problem.manage'
  | 'contest.participant.manage'
  | 'contest.notice.manage'
  | 'contest.board.question.manage'
  | 'contest.scoreboard.manage'
  | 'contest.update_overview'
  | 'contest.update_organization'
  | 'contest.update_rule'
  | 'contest.update_schedule'
  | 'contest.participant.view'
  | 'contest.participant.create'
  | 'contest.participant.update'
  | 'contest.participant.remove'
  | 'contest.participant.bulk_create'
  | 'contest.problem.view'
  | 'contest.problem.create'
  | 'contest.problem.update'
  | 'contest.problem.delete'
  | 'contest.problem.reorder'
  | 'contest.problem.resource.view'
  | 'contest.problem.resource.manage'
  | 'contest.testcase.view'
  | 'contest.testcase.manage'
  | 'contest.generator.view'
  | 'contest.generator.manage'
  | 'contest.submission.view'
  | 'contest.submission.source.view'
  | 'contest.scoreboard.view'
  | 'contest.scoreboard.freeze'
  | 'contest.scoreboard.unfreeze'
  | 'contest.scoreboard.setting'
  | 'contest.scoreboard.score_adjust'
  | 'contest.notice.view'
  | 'contest.notice.create'
  | 'contest.notice.update'
  | 'contest.notice.delete'
  | 'contest.notice.emergency_publish'
  | 'contest.board.question.view'
  | 'contest.board.answer.create';

type PermissionSession = GeneralSession | StaffSession | null | undefined;

export const operatorHomePermissions = [
  'contest.participant.preview',
  'contest.settings.manage',
  'contest.staff.manage',
  'contest.participant.view',
  'contest.notice.view',
  'contest.board.question.view',
  'contest.problem.manage',
  'contest.submission.view',
  'contest.scoreboard.view',
  'contest.audit.view',
] as const satisfies readonly ContestPermissionCode[];

function isStaffSession(session: PermissionSession): session is StaffSession {
  return Boolean(session && 'staff' in session);
}

function scopeMatches(scope: string, permission: string) {
  if (
    scope === '*' ||
    scope === 'master' ||
    scope === 'contest.*' ||
    scope === permission
  ) {
    return true;
  }

  if (scope.endsWith('.*')) {
    return permission.startsWith(scope.slice(0, -1));
  }

  return permission.startsWith(`${scope}.`);
}

export function contestScopesFor(
  session: PermissionSession,
  contestId: string,
) {
  if (!session) return [];

  const scopes = isStaffSession(session)
    ? (session.staff.contest_scopes[contestId] ?? [])
    : [
        ...(session.operatorContests.find(
          (item) => item.contest.contest_id === contestId,
        )?.scopes ?? []),
        ...(session.operatorSession?.staff.contest_scopes[contestId] ?? []),
      ];

  return Array.from(new Set(scopes.filter(Boolean)));
}

export function isServiceMaster(session: PermissionSession) {
  if (isStaffSession(session)) return session.staff.is_service_master;

  return Boolean(session?.operatorSession?.staff.is_service_master);
}

export function isContestMaster(session: PermissionSession, contestId: string) {
  return (
    isServiceMaster(session) ||
    contestScopesFor(session, contestId).some((scope) =>
      ['*', 'master', 'contest.*'].includes(scope),
    )
  );
}

export function hasContestAccess(
  session: PermissionSession,
  contestId: string,
) {
  return (
    isServiceMaster(session) || contestScopesFor(session, contestId).length > 0
  );
}

export function hasContestPermission(
  session: PermissionSession,
  contestId: string,
  permission?: ContestPermissionCode | readonly ContestPermissionCode[],
  contestStatus?: string,
): boolean {
  if (!permission) return hasContestAccess(session, contestId);
  if (Array.isArray(permission)) {
    return permission.some((entry) =>
      hasContestPermission(session, contestId, entry, contestStatus),
    );
  }
  if (isServiceMaster(session)) return true;

  if (hasContestAccess(session, contestId)) {
    if (
      permission === 'contest.notice.view' ||
      permission === 'contest.board.question.view'
    )
      return true;
    if (permission === 'contest.problem.view' && contestStatus === 'running')
      return true;
  }

  return contestScopesFor(session, contestId).some(
    (scope) =>
      scopeMatches(scope, permission as ContestPermissionCode) ||
      (permission === 'contest.problem.view' &&
        scopeMatches(scope, 'contest.problem.review')),
  );
}
