import { compareProblemCodes } from '@/domains/problemManagement/problemCodeOrder';
import { formatScore } from '@/domains/submissionScoreboard/scoring';
import type {
  OperatorPresentationScoreboardSection,
  ScoreboardProblemScore,
} from '@/domains/submissionScoreboard/types';

export type PresentationBoardProblem = {
  code: string;
  title: string;
  maxScore?: number;
};

/** Keep all published columns, including older records absent from metadata. */
export function presentationBoardProblems(
  section: OperatorPresentationScoreboardSection,
): PresentationBoardProblem[] {
  const problems = new Map<string, PresentationBoardProblem>();
  section.problems.forEach((problem) =>
    problems.set(problem.problem_code, {
      code: problem.problem_code,
      title: problem.title,
    }),
  );
  section.rows.forEach((row) =>
    row.problem_scores.forEach((score) => {
      const problem = problems.get(score.problem_code) ?? {
        code: score.problem_code,
        title: '',
      };
      if (
        typeof score.max_score === 'number' &&
        Number.isFinite(score.max_score) &&
        score.max_score >= 0
      ) {
        problem.maxScore = score.max_score;
      }
      problems.set(score.problem_code, problem);
    }),
  );
  return [...problems.values()].sort((a, b) =>
    compareProblemCodes(a.code, b.code),
  );
}

export function presentationCellState(
  score: ScoreboardProblemScore | undefined,
  points: boolean,
) {
  if (points) {
    const hasResult =
      score && (score.solved || score.attempts > 0 || (score.score ?? 0) > 0);
    const value =
      hasResult &&
      typeof score?.score === 'number' &&
      Number.isFinite(score.score)
        ? score.score
        : undefined;
    const maxScore =
      typeof score?.max_score === 'number' &&
      Number.isFinite(score.max_score) &&
      score.max_score >= 0
        ? score.max_score
        : undefined;
    const full =
      !!score?.solved ||
      (hasResult &&
        value !== undefined &&
        maxScore !== undefined &&
        value >= maxScore);
    const pending = !full ? (score?.pending_attempts ?? 0) : 0;
    const state =
      value === undefined
        ? pending
          ? 'pending'
          : 'empty'
        : full
          ? 'full'
          : value > 0
            ? 'partial'
            : 'wrong';
    const label =
      value === undefined
        ? pending
          ? `미공개 제출 ${pending}건`
          : hasResult
            ? '점수 정보 없음'
            : '미시도'
        : `${formatScore(value)}${maxScore === undefined ? '' : ` / ${formatScore(maxScore)}`}점${pending ? ` · 미공개 제출 ${pending}건` : ''}`;
    return { state, value, maxScore, pending, label } as const;
  }

  const pending = !score?.solved ? (score?.pending_attempts ?? 0) : 0;
  const state = score?.solved
    ? 'full'
    : pending
      ? 'pending'
      : score?.attempts
        ? 'wrong'
        : 'empty';
  const label = score?.solved
    ? `정답${score.wrong_attempts ? ` · 오답 ${score.wrong_attempts}회` : ''}`
    : pending
      ? `미공개 제출 ${pending}건`
      : score?.attempts
        ? `오답 ${score.attempts}회`
        : '미시도';
  return {
    state,
    value: undefined,
    maxScore: undefined,
    pending,
    label,
  } as const;
}
