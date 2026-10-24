import type {
  Contest,
  ContestResourceAccess,
  ContestStatus,
  Division,
} from '@/domains/contestAdministration/types';
import { timeLeft } from '@/shared/lib/dateTime';

export const CONTEST_STATUS_OPTIONS: ContestStatus[] = [
  'draft',
  'scheduled',
  'open',
  'running',
  'ended',
];

export function emptyContest(contestId?: string): Contest {
  const now = new Date().toISOString();

  return {
    contest_id: contestId ?? '',
    title: '대회',
    organization_name: '',
    overview: '',
    status: 'draft',
    visibility: 'public',
    visibility_after_end: 'public',
    start_at: now,
    end_at: now,
    freeze_at: now,
    problem_access_after_end: 'private',
    scoreboard_public_during_contest: false,
    hide_participation_counts_before_start: false,
    scoreboard_access_after_end: 'private',
    submission_access_after_end: 'private',
    board_access_after_end: 'participants',
    notice_access_after_end: 'public',
    editorial_access_after_end: 'private',
    scoreboard_freeze_mode: 'auto',
    scoreboard_release_mode: 'manual',
    mock_judging_enabled: false,
    freeze_submission_count_visible: false,
    participant_progress_visible: false,
    mock_judging_progress_visible: false,
    emergency_notice: null,
  };
}

export function emptyDivision(): Division {
  return { division_id: '', code: '', name: '유형 없음', description: '' };
}

export function isScheduleTbd(contestOrStatus: Contest | string) {
  const status =
    typeof contestOrStatus === 'string'
      ? contestOrStatus
      : contestOrStatus.status;
  return status === 'schedule_tbd' || status === 'draft';
}

export function isContestEnded(contest: Contest) {
  if (isScheduleTbd(contest)) return false;

  return (
    contest.status === 'ended' ||
    contest.status === 'finalized' ||
    contest.status === 'archived' ||
    new Date(contest.end_at).getTime() <= Date.now()
  );
}

export function isContestOperationLocked(contest: Contest) {
  if (isScheduleTbd(contest)) return false;

  const now = Date.now();
  const inTimeWindow =
    new Date(contest.start_at).getTime() <= now &&
    now < new Date(contest.end_at).getTime() &&
    !['ended', 'finalized', 'archived'].includes(contest.status);

  return contest.status === 'running' || inTimeWindow;
}

export function contestStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '초안',
    schedule_tbd: '초안',
    scheduled: '예정(비공개)',
    open: '예정(공개)',
    running: '진행중',
    ended: '종료',
    finalized: '종료',
    archived: '종료',
  };

  return labels[status] ?? status;
}

export function isContestHiddenFromPublic(contestOrStatus: Contest | string) {
  const status =
    typeof contestOrStatus === 'string'
      ? contestOrStatus
      : contestOrStatus.status;
  return ['draft', 'schedule_tbd', 'scheduled'].includes(status);
}

export function contestAccessPhase(
  contest: Contest,
): 'schedule_tbd' | 'before' | 'running' | 'ended' {
  if (isScheduleTbd(contest)) return 'schedule_tbd';

  const now = Date.now();
  if (isContestEnded(contest)) return 'ended';
  if (now < new Date(contest.start_at).getTime()) return 'before';

  return 'running';
}

export function canViewContestResource(
  contest: Contest,
  hasSessionAccess: boolean,
  afterEndAccess: ContestResourceAccess | boolean | undefined,
) {
  const visibility = isContestEnded(contest)
    ? contest.visibility_after_end
    : contest.visibility;
  if (visibility === 'private' && !hasSessionAccess) return false;

  const access =
    typeof afterEndAccess === 'boolean'
      ? afterEndAccess
        ? 'public'
        : 'private'
      : (afterEndAccess ?? 'private');

  if (isContestEnded(contest)) {
    if (access === 'public') return true;
    if (access === 'participants') return hasSessionAccess;
    return false;
  }

  if (contestAccessPhase(contest) === 'running') {
    if (access === 'public') return true;
    if (hasSessionAccess) return true;
    return false;
  }

  if (hasSessionAccess) return true;
  return false;
}

export function sortContestsByStartAt(contests: Contest[]) {
  return [...contests].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );
}

export function contestPublicVisibility(contest: Contest) {
  return {
    problems: contestResourceAccess(contest, 'problem') === 'public',
    scoreboard: contestResourceAccess(contest, 'scoreboard') === 'public',
    submissions: contestResourceAccess(contest, 'submission') === 'public',
  };
}

export function contestResourceAccess(
  contest: Contest,
  resource:
    | 'problem'
    | 'scoreboard'
    | 'submission'
    | 'board'
    | 'notice'
    | 'editorial',
): ContestResourceAccess {
  if (resource === 'problem') {
    return contest.problem_access_after_end ?? 'private';
  }
  if (resource === 'scoreboard') {
    if (contestAccessPhase(contest) === 'running') {
      return contest.scoreboard_public_during_contest
        ? 'public'
        : 'participants';
    }
    return contest.scoreboard_access_after_end ?? 'private';
  }
  if (resource === 'submission') {
    return contest.submission_access_after_end ?? 'private';
  }
  if (resource === 'board')
    return contest.board_access_after_end ?? 'participants';
  if (resource === 'editorial') {
    return contest.editorial_access_after_end ?? 'private';
  }
  return contest.notice_access_after_end ?? 'public';
}

export function contestResourceAccessMessage(
  contest: Contest,
  resource:
    | 'problem'
    | 'scoreboard'
    | 'submission'
    | 'board'
    | 'notice'
    | 'editorial',
  hasSessionAccess: boolean,
) {
  const labels = {
    board: '게시판',
    notice: '공지사항',
    problem: '문제집',
    scoreboard: '스코어보드',
    submission: '채점현황',
    editorial: '해설',
  };
  const phase = contestAccessPhase(contest);
  const access = contestResourceAccess(contest, resource);

  if (phase === 'ended') {
    if (access === 'private') {
      return `${labels[resource]}은 대회 설정에서 종료 후 비공개로 설정되어 있습니다.`;
    }
    if (access === 'participants' && !hasSessionAccess) {
      return `${labels[resource]}은 대회 설정에서 종료 후 참가자에게만 공개되도록 설정되어 있습니다. 참가팀 로그인 후 확인할 수 있습니다.`;
    }
  }

  if (phase === 'schedule_tbd')
    return `대회가 초안 상태라 ${labels[resource]}을 볼 수 없습니다.`;
  if (phase === 'before')
    return `대회 시작 전이라 ${labels[resource]}을 볼 수 없습니다.`;

  return `${labels[resource]}을 보려면 참가팀 로그인이 필요합니다.`;
}

export function contestRemainingLabel(contest: Contest) {
  const phase = contestAccessPhase(contest);
  if (phase === 'schedule_tbd') return '초안';
  if (phase === 'before') return `시작까지 ${timeLeft(contest.start_at)}`;
  if (phase === 'ended') return '종료됨';
  return `종료까지 ${timeLeft(contest.end_at)}`;
}

export function problemVisibilityMessage(
  contest: Contest,
  hasSessionAccess: boolean,
  afterEndAccess: ContestResourceAccess | boolean | undefined,
) {
  if (canViewContestResource(contest, hasSessionAccess, afterEndAccess))
    return undefined;

  const phase = contestAccessPhase(contest);
  if (phase === 'schedule_tbd')
    return '대회가 초안 상태라 문제집이 비공개 상태입니다.';
  if (phase === 'before') return '대회 시작 전이라 문제집이 비공개 상태입니다.';
  if (phase === 'ended') {
    return '대회가 종료되어 문제집이 비공개 상태입니다. 운영자가 종료 후 공개 범위를 변경하면 열람할 수 있습니다.';
  }

  return '대회 중에는 참가팀 로그인 후 본인 참가 유형의 문제집만 볼 수 있습니다.';
}

export function participantProblemEmptyMessage(
  contest: Contest,
  hasSessionAccess: boolean,
  afterEndAccess: ContestResourceAccess | boolean | undefined,
) {
  const phase = contestAccessPhase(contest);
  if (phase === 'schedule_tbd')
    return '대회가 초안 상태라 문제집이 공개되지 않았습니다.';
  if (phase === 'before')
    return '대회 시작 전이라 문제집이 아직 공개되지 않았습니다.';
  if (
    phase === 'ended' &&
    !canViewContestResource(contest, hasSessionAccess, afterEndAccess)
  ) {
    return '대회가 종료되어 문제집이 비공개 상태입니다.';
  }
  if (!hasSessionAccess) return '문제집을 보려면 참가팀 로그인이 필요합니다.';

  return undefined;
}

export function isFrozen(contest: Contest) {
  const now = Date.now();
  return (
    now >= new Date(contest.freeze_at).getTime() &&
    now < new Date(contest.end_at).getTime()
  );
}

export function freezeAnnouncement(contest: Contest) {
  const diffMinutes = Math.ceil(
    (new Date(contest.freeze_at).getTime() - Date.now()) / 60000,
  );
  if (diffMinutes <= 0 || diffMinutes > 30) return '';

  const threshold =
    diffMinutes <= 1 ? 1 : diffMinutes <= 5 ? 5 : diffMinutes <= 10 ? 10 : 30;
  return `스코어보드 프리즈 ${threshold}분 전입니다. 프리즈 이후 공개 스코어보드는 프리즈 시점 순위만 표시됩니다.`;
}

export function contestStartAnnouncement(contest: Contest) {
  const diffMinutes = Math.ceil(
    (new Date(contest.start_at).getTime() - Date.now()) / 60000,
  );
  if (diffMinutes <= 0 || diffMinutes > 30) return '';

  const threshold =
    diffMinutes <= 1 ? 1 : diffMinutes <= 5 ? 5 : diffMinutes <= 10 ? 10 : 30;
  return `대회 시작 ${threshold}분 전입니다. 시작 후 문제와 제출 기능이 열립니다.`;
}

export function scoreboardFreezeEndAnnouncement(contest: Contest) {
  const diffMinutes = Math.ceil(
    (new Date(contest.end_at).getTime() - Date.now()) / 60000,
  );
  if (diffMinutes <= 0 || diffMinutes > 30) return '';

  const threshold =
    diffMinutes <= 1 ? 1 : diffMinutes <= 5 ? 5 : diffMinutes <= 10 ? 10 : 30;
  return `스코어보드 프리즈 종료 ${threshold}분 전입니다. 대회 종료 후에는 제출할 수 없습니다.`;
}
