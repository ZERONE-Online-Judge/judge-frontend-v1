import type { Contest } from '@/domains/contestAdministration/types';
import {
  contestAccessPhase,
  contestResourceAccess,
  contestStatusLabel,
} from '@/domains/contestAdministration/logic';
import { formatContestMoment, timeLeft } from '@/shared/lib/dateTime';

export function contestPeriodLabel(contest: Contest) {
  const phase = contestAccessPhase(contest);
  if (phase === 'schedule_tbd') return undefined;

  const start = formatContestMoment(contest.start_at);
  const end = formatContestMoment(contest.end_at);

  return `${start} - ${end}`;
}

export function contestIsOpen(contest: Contest) {
  const phase = contestAccessPhase(contest);
  return phase === 'before' || phase === 'running' || contest.status === 'open';
}

export function contestCountdownLabel(contest: Contest) {
  const phase = contestAccessPhase(contest);

  if (phase === 'running') {
    return `남은 시간 ${timeLeft(contest.end_at)}`;
  }

  if (phase === 'before') {
    // Compare Korean calendar dates, independently of the start time.
    const koreanDay = (timestamp: number) =>
      Math.floor((timestamp + 9 * 3_600_000) / 86_400_000);
    const days =
      koreanDay(Date.parse(contest.start_at)) - koreanDay(Date.now());
    if (days > 0) return `D-${days}`;
    return 'D-Day';
  }

  if (phase === 'schedule_tbd') return '초안';

  return undefined;
}

function contestPublicResourceLabels(contest: Contest) {
  if (contestAccessPhase(contest) !== 'ended') return [];

  const resources = [
    ['problem', '문제집'],
    ['scoreboard', '스코어보드'],
    ['submission', '채점현황'],
    ['notice', '공지사항'],
    ['board', '게시판'],
  ] as const;

  return resources.flatMap(([resource, label]) => {
    const access = contestResourceAccess(contest, resource);
    if (access === 'public') return [`${label} 비로그인 공개`];
    if (access === 'participants') return [`${label} 참가자 공개 유지`];
    return [];
  });
}

export function toContestCardData(contest: Contest) {
  return {
    contestId: contest.contest_id,
    title: contest.title,
    organization: contest.organization_name,
    status: contestStatusLabel(contest.status),
    countdownLabel: contestCountdownLabel(contest),
    period: contestPeriodLabel(contest),
    isOpen: contestIsOpen(contest),
    publicResourceLabels: contestPublicResourceLabels(contest),
  };
}
