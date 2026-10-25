import type { StaffAccount } from '@/domains/identityAccess/types';

export const CONTEST_ROLES = [
  {
    value: 'owner',
    label: '대회 총괄',
    description:
      '대회의 모든 권한을 가지며, 대회마다 한 명만 맡습니다. 위임으로만 변경할 수 있습니다.',
  },
  {
    value: 'master',
    label: '대회 마스터',
    description:
      '이 대회의 모든 권한을 가집니다. 다른 역할과 함께 선택할 수 없습니다.',
  },
  {
    value: 'settings_manager',
    label: '대회 운영진 · 대회 설정 관리',
    description: '대회 정보, 일정과 공개 범위를 관리합니다.',
  },
  {
    value: 'participants_manager',
    label: '대회 운영진 · 참가자 관리',
    description:
      '참가 유형과 참가팀을 관리하고 참가자 로그아웃 및 접속 기록을 확인합니다.',
  },
  {
    value: 'posts_manager',
    label: '대회 운영진 · 게시판 관리',
    description: '게시판의 글과 답변을 관리하고 참가자의 질문에 답변합니다.',
  },
  {
    value: 'notices_manager',
    label: '대회 운영진 · 공지 작성',
    description: '공지를 작성·수정·삭제하고 긴급 공지를 게시합니다.',
  },
  {
    value: 'staff_manager',
    label: '대회 운영진 · 운영자 관리',
    description:
      '운영진의 이름과 역할을 관리합니다. 마스터 권한은 부여할 수 없습니다.',
  },
  {
    value: 'problems_viewer',
    label: '대회 운영진 · 문제 확인',
    description: '문제 모아보기에서 지문, 예제와 첨부 이미지를 확인합니다.',
  },
  {
    value: 'submissions_viewer',
    label: '대회 운영진 · 제출 확인',
    description: '참가팀의 제출, 소스 코드와 채점 결과를 확인합니다.',
  },
  {
    value: 'scoreboard_viewer',
    label: '대회 운영진 · 스코어보드 확인',
    description:
      '프리즈를 무시한 실제 순위와 프레젠테이션을 조회합니다. 이 권한이 없어도 대회 시작 후 참가자 순위표는 볼 수 있습니다.',
  },
  {
    value: 'scoreboard_manager',
    label: '대회 운영진 · 스코어보드 관리',
    description: '스코어보드 상태를 관리하고 프레젠테이션의 순위를 공개합니다.',
  },
  {
    value: 'audit_viewer',
    label: '대회 운영진 · 운영로그 보기',
    description: '대회 운영 감사로그와 참가자 접속 기록을 확인합니다.',
  },
  {
    value: 'problem_author',
    label: '출제진',
    description:
      '문제 추가·수정, 테스트케이스와 채점 파일을 관리하고 검증 코드를 채점합니다.',
  },
  {
    value: 'problem_reviewer',
    label: '검수진',
    description: '문제 모아보기에서 문제를 풀고 자신의 검수 코드를 제출합니다.',
  },
  {
    value: 'participant_preview',
    label: '대회 운영진 · 참가자 미리보기',
    description:
      '운영자 화면에서 새 탭으로 참가자 화면을 열어 문제·제출·게시판을 점검합니다.',
  },
] as const;

export type ContestRole = (typeof CONTEST_ROLES)[number]['value'];

const roleScopes: Record<Exclude<ContestRole, 'master' | 'owner'>, string> = {
  settings_manager: 'contest.settings.manage',
  participants_manager: 'contest.participant.manage',
  posts_manager: 'contest.board.question.manage',
  notices_manager: 'contest.notice.manage',
  staff_manager: 'contest.staff.manage',
  problems_viewer: 'contest.problem.view',
  submissions_viewer: 'contest.submission.view',
  scoreboard_viewer: 'contest.scoreboard.view',
  scoreboard_manager: 'contest.scoreboard.manage',
  audit_viewer: 'contest.audit.view',
  problem_author: 'contest.problem.manage',
  problem_reviewer: 'contest.problem.review',
  participant_preview: 'contest.participant.preview',
};

export type ContestRoleTitle =
  | '총괄'
  | '마스터'
  | '출제진'
  | '운영진'
  | '검수진';

export function withIncludedContestRoles(
  roles: readonly ContestRole[],
): ContestRole[] {
  const included = new Set(roles);
  if (included.has('problem_author')) included.add('problem_reviewer');
  if (included.has('problem_reviewer')) included.add('problems_viewer');
  return [...included];
}

export function contestRoleTitle(
  roles: readonly ContestRole[],
): ContestRoleTitle | null {
  if (roles.includes('owner')) return '총괄';
  if (roles.includes('master')) return '마스터';
  if (roles.includes('problem_author')) return '출제진';
  if (roles.includes('problem_reviewer')) return '검수진';
  return roles.length ? '운영진' : null;
}

export function contestRoleTitleForScopes(
  scopes: readonly string[],
): ContestRoleTitle | null {
  if (scopes.includes('contest.owner')) return '총괄';
  if (scopes.some((scope) => ['*', 'master', 'contest.*'].includes(scope)))
    return '마스터';
  const authorScopes = [
    'contest.problem',
    'contest.problem.*',
    roleScopes.problem_author,
    'contest.problem.create',
    'contest.problem.update',
    'contest.problem.delete',
    'contest.problem.reorder',
  ];
  const authorScopeGroups = [
    'contest.problem.resource',
    'contest.testcase',
    'contest.generator',
  ];
  if (
    scopes.some(
      (scope) =>
        authorScopes.includes(scope) ||
        authorScopeGroups.some(
          (group) => scope === group || scope.startsWith(`${group}.`),
        ),
    )
  )
    return '출제진';
  if (
    scopes.some((scope) =>
      ['contest.problem.review', 'contest.problem.test'].includes(scope),
    )
  )
    return '검수진';
  const reviewScopes = [
    'contest.view',
    'contest.problem.review',
    'contest.problem.test',
  ];
  if (
    scopes.some(
      (scope) => scope.startsWith('contest.') && !reviewScopes.includes(scope),
    )
  )
    return '운영진';
  return scopes.includes('contest.view') ? '운영진' : null;
}

export function contestRoleTitleForAccount(
  account: StaffAccount,
  contestId: string,
): ContestRoleTitle | null {
  if (account.is_service_master) return '마스터';
  const configured = account.contest_roles?.[contestId];
  return configured?.length
    ? contestRoleTitle(configured)
    : contestRoleTitleForScopes(account.contest_scopes[contestId] ?? []);
}

export function contestRolesForAccount(
  account: StaffAccount,
  contestId: string,
): ContestRole[] {
  const configured = account.contest_roles?.[contestId];
  if (configured) return withIncludedContestRoles(configured);
  const scopes = account.contest_scopes[contestId] ?? [];
  if (scopes.includes('contest.owner')) return ['owner'];
  if (scopes.some((scope) => ['*', 'master', 'contest.*'].includes(scope)))
    return ['master'];
  return withIncludedContestRoles(
    CONTEST_ROLES.flatMap(({ value }) => {
      if (
        value === 'owner' ||
        value === 'master' ||
        !scopes.includes(roleScopes[value])
      )
        return [];
      if (
        value === 'scoreboard_viewer' &&
        scopes.includes(roleScopes.scoreboard_manager)
      )
        return [];
      if (
        value === 'problem_reviewer' &&
        scopes.includes(roleScopes.problem_author)
      )
        return [];
      return [value];
    }),
  );
}

export function isAssignedContestMaster(
  account: StaffAccount,
  contestId: string,
) {
  return account.protected_master_contests?.includes(contestId) ?? false;
}

export function isContestOwner(account: StaffAccount, contestId: string) {
  return (
    !account.is_service_master &&
    contestRolesForAccount(account, contestId).includes('owner')
  );
}
