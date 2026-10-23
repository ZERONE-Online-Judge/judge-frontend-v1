import type { ScoreboardReleaseMode } from '@/domains/contestAdministration/types';

export const SCOREBOARD_RELEASE_OPTIONS: {
  value: ScoreboardReleaseMode;
  label: string;
  description: string;
  flow: string[];
}[] = [
  {
    value: 'manual',
    label: '순위별 공개',
    description:
      '종료 후 프리즈 순위를 유지합니다. 운영자가 공개를 시작하면 팀 정보가 가려지고, 선택한 최종 순위의 팀과 성적이 나타납니다.',
    flow: ['프리즈 표 유지', '공개 시작 · 팀 정보 가림', '원하는 순위 공개'],
  },
  {
    value: 'immediate',
    label: '종료 즉시 전체 공개',
    description:
      '대회가 종료되면 자동으로 프리즈가 풀리고 모든 팀의 성적이 표시됩니다. 남은 채점과 재채점 결과도 계속 반영됩니다.',
    flow: ['대회 종료', '프리즈 자동 해제', '전체 성적 실시간 반영'],
  },
  {
    value: 'resolver',
    label: '결과 순차 공개 (리졸버)',
    description:
      '종료 후 프리즈 표와 팀명을 유지합니다. 운영자가 발표를 시작한 뒤 하위 팀의 첫 미공개 문제의 제출을 한 번에 공개하면 점수와 순위가 움직입니다.',
    flow: ['프리즈 표 유지', '발표 시작', '다음 문제 공개 · 순위 이동'],
  },
];

export function scoreboardReleaseOption(mode?: ScoreboardReleaseMode) {
  return (
    SCOREBOARD_RELEASE_OPTIONS.find((option) => option.value === mode) ??
    SCOREBOARD_RELEASE_OPTIONS[0]
  );
}
