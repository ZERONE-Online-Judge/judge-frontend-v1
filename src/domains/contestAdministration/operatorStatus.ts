import type { Contest } from '@/domains/contestAdministration/types';

export function operatorContestStatus(contest: Contest, now: number) {
  const start = Date.parse(contest.start_at);
  const end = Date.parse(contest.end_at);
  const freeze = Date.parse(contest.freeze_at);
  const draft = ['draft', 'schedule_tbd'].includes(contest.status);
  const validSchedule =
    Number.isFinite(start) && Number.isFinite(end) && end > start;
  const ended = ['ended', 'finalized', 'archived'].includes(contest.status);
  const phase = draft
    ? 'draft'
    : ended
      ? 'ended'
      : !validSchedule
        ? 'unknown'
        : now >= end
          ? 'ended'
          : now < start
            ? 'before'
            : 'running';
  const title = {
    draft: '대회 준비 중',
    before: '대회 시작 전',
    running: '대회 진행 중',
    ended: '대회 종료',
    unknown: '일정 확인 필요',
  }[phase];
  const description = {
    draft: '초안 상태입니다. 일정과 상태를 설정하면 대회를 시작할 수 있습니다.',
    before: '시작 시각이 되면 대회가 자동으로 시작됩니다.',
    running: '참가자가 문제를 풀고 코드를 제출할 수 있습니다.',
    ended: '참가자 제출이 마감되었습니다. 결과 공개와 후속 운영을 진행하세요.',
    unknown: '대회 설정에서 시작·종료 시각을 확인해 주세요.',
  }[phase];
  const visibility =
    phase === 'draft' || (phase === 'before' && contest.status === 'scheduled')
      ? '운영자만 열람'
      : (phase === 'ended'
            ? contest.visibility_after_end
            : contest.visibility) === 'private'
        ? '등록 참가자·운영자만 열람'
        : '대회 목록 공개';
  const mode = contest.scoreboard_freeze_mode ?? 'auto';
  const freezeActive =
    phase === 'running' &&
    (mode === 'frozen' ||
      (mode !== 'live' && Number.isFinite(freeze) && now >= freeze));
  const freezeRemaining =
    phase === 'running' &&
    mode === 'auto' &&
    Number.isFinite(freeze) &&
    freeze > now &&
    freeze < end
      ? freeze - now
      : null;
  const releaseLabel = {
    manual: '순위별 공개',
    immediate: '종료 즉시 전체 공개',
    resolver: '결과 순차 공개 (리졸버)',
  }[contest.scoreboard_release_mode ?? 'manual'];
  const scoreboard =
    phase === 'ended'
      ? {
          label: releaseLabel,
          detail:
            '종료 후 순위 공개 방식입니다. 공개 현황은 스코어보드 탭에서 확인하세요.',
        }
      : mode === 'live'
        ? {
            label: '실시간 반영 · 프리즈 해제',
            detail:
              '설정된 프리즈 시각과 관계없이 스코어보드에 결과를 반영합니다.',
          }
        : mode === 'frozen'
          ? {
              label: '수동 프리즈 적용',
              detail:
                '스코어보드의 이후 결과는 가려집니다. 대회 중에는 제출을 계속 받습니다.',
            }
          : freezeActive
            ? {
                label: '프리즈 적용 중',
                detail:
                  '스코어보드의 이후 결과는 가려집니다. 참가자 제출은 계속 가능합니다.',
              }
            : {
                label:
                  phase === 'running'
                    ? '스코어보드 실시간 반영'
                    : '프리즈 자동 적용 예정',
                detail:
                  '프리즈 시각부터 참가자 스코어보드의 이후 결과가 가려집니다.',
              };
  return {
    phase,
    title,
    description,
    visibility,
    scoreboard,
    freezeActive,
    freezeRemaining,
    freezeProgress:
      validSchedule &&
      Number.isFinite(freeze) &&
      freeze >= start &&
      freeze <= end
        ? ((freeze - start) / (end - start)) * 100
        : null,
    remaining:
      phase === 'before' ? start - now : phase === 'running' ? end - now : null,
    progress:
      phase === 'ended'
        ? 100
        : phase === 'running'
          ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
          : 0,
    showSchedule: !draft && validSchedule,
    submissionLabel:
      phase === 'running'
        ? '제출 가능'
        : phase === 'ended'
          ? '제출 마감'
          : phase === 'unknown'
            ? '제출 상태 확인 필요'
            : '제출 대기',
  };
}

export function countdownParts(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return {
    days: Math.floor(seconds / 86400),
    hours: String(Math.floor(seconds / 3600) % 24).padStart(2, '0'),
    minutes: String(Math.floor(seconds / 60) % 60).padStart(2, '0'),
    seconds: String(seconds % 60).padStart(2, '0'),
  };
}

export function formatOperatorMoment(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '일정 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
