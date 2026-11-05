import type { ScoreboardReleaseMode } from '@/domains/contestAdministration/types';

export const SCOREBOARD_RELEASE_OPTIONS: {
  value: ScoreboardReleaseMode;
  label: string;
  description: string;
  flow: string[];
}[] = [
  {
    value: 'resolver',
    label: '결과 순차 공개 (리졸버)',
    description:
      '종료 후 프리즈 표와 팀명을 유지합니다. 운영자가 발표를 시작한 뒤 하위 팀의 첫 미공개 문제의 제출을 한 번에 공개하면 점수와 순위가 움직입니다.',
    flow: ['프리즈 표 유지', '발표 시작', '다음 문제 공개 · 순위 이동'],
  },
  {
    value: 'manual_all',
    label: '운영진 일괄 공개',
    description:
      '종료 후 운영자가 전체 공개 버튼을 누를 때까지 프리즈 표를 유지합니다. 공개 후 남은 채점과 재채점 결과도 계속 반영됩니다.',
    flow: [
      '대회 종료 · 프리즈 유지',
      '운영자가 전체 공개',
      '전체 성적 실시간 반영',
    ],
  },
  {
    value: 'manual',
    label: '순위별 공개',
    description:
      '선택한 최종 순위의 팀을 확정 순위로 공개합니다. 발표한 순위는 고정되며, 아직 공개하지 않은 팀은 별도의 프리즈 순위 영역에 표시합니다.',
    flow: [
      '팀명·프리즈 기록 유지',
      '개별 순위 공개 시작',
      '선택한 최종 순위 확정',
    ],
  },
  {
    value: 'immediate',
    label: '종료 즉시 전체 공개',
    description:
      '대회가 종료되면 자동으로 프리즈가 풀리고 모든 팀의 성적이 표시됩니다. 남은 채점과 재채점 결과도 계속 반영됩니다.',
    flow: ['대회 종료', '프리즈 자동 해제', '전체 성적 실시간 반영'],
  },
];

export function scoreboardReleaseOption(mode?: ScoreboardReleaseMode) {
  return (
    SCOREBOARD_RELEASE_OPTIONS.find((option) => option.value === mode) ??
    SCOREBOARD_RELEASE_OPTIONS[0]
  );
}
