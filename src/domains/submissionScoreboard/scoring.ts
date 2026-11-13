import type { ContestScoringMode } from '@/domains/contestAdministration/types';
import type { Submission } from './types';

export const IOI_RULES_URL = 'https://www.ioi2024.org/contest-rules';
export const IOI_SCORING_DESCRIPTION =
  '문제당 100점입니다. 각 서브태스크에서 받은 최고점을 제출 간에 합산합니다. 총점이 같으면 공동 순위이며 시간·오답 페널티는 없습니다.';

export function isIoiScoring(mode?: ContestScoringMode | string | null) {
  return mode === 'ioi';
}

export function formatScore(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
    : '—';
}

export function submissionScoreLabel(
  submission?: Pick<
    Submission,
    'scoring_mode' | 'score' | 'max_score' | 'status'
  > | null,
) {
  if (!submission || !isIoiScoring(submission.scoring_mode)) return null;
  if (['waiting', 'preparing', 'judging'].includes(submission.status))
    return null;
  if (submission.score == null) return '점수 미반영';
  return `${formatScore(submission.score)} / ${formatScore(submission.max_score ?? 100)}점`;
}
