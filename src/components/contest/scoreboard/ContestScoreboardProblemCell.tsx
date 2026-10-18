import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { ScoreboardProblemScore } from '@/domains/submissionScoreboard/types';

type ContestScoreboardProblemCellProps = {
  score?: ScoreboardProblemScore;
};

function scoreLabel(score?: ScoreboardProblemScore) {
  if (!score) return '';
  if (score.solved) {
    return score.wrong_attempts > 0 ? (
      `+${score.wrong_attempts}`
    ) : (
      <InterfaceIcon name="check" size={14} label="정답" />
    );
  }
  if (score.attempts > 0) return `-${score.attempts}`;

  return '';
}

export default function ContestScoreboardProblemCell({
  score,
}: ContestScoreboardProblemCellProps) {
  if (score?.pending_attempts && !score.solved) {
    const description = `미공개 제출 ${score.pending_attempts}건${score.attempts ? ` · 공개된 실패 ${score.attempts}회` : ''}`;
    return (
      <span
        className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full bg-amber-100 px-1 text-xs font-black text-amber-900"
        aria-label={description}
        title={description}
      >
        ?{score.pending_attempts}
      </span>
    );
  }
  const label = scoreLabel(score);
  if (!label) return null;

  const isSolved = score?.solved;

  return (
    <span
      className={[
        'inline-flex size-7 items-center justify-center rounded-full text-xs font-black',
        isSolved
          ? 'bg-emerald-100 text-slate-950'
          : 'bg-red-100 text-slate-950',
      ].join(' ')}
    >
      {label}
    </span>
  );
}
