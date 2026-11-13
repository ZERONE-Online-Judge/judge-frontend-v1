import type { ContestScoringMode } from '@/domains/contestAdministration/types';
import { formatScore } from '@/domains/submissionScoreboard/scoring';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { ScoreboardProblemScore } from '@/domains/submissionScoreboard/types';

type ContestScoreboardProblemCellProps = {
  score?: ScoreboardProblemScore;
  scoringMode?: ContestScoringMode;
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
  scoringMode = 'icpc',
}: ContestScoreboardProblemCellProps) {
  if (scoringMode === 'ioi') {
    const pending = score?.pending_attempts ?? 0;
    if (!score || (!score.attempts && !pending && !score.score)) return null;
    const value = score.score ?? 0;
    const full = value === (score.max_score ?? 100);
    const description = `${formatScore(value)} / ${formatScore(score.max_score ?? 100)}점${pending ? ` · 미공개 제출 ${pending}건` : ''} · 서브태스크별 최고점 합산`;
    return (
      <span
        className="inline-flex flex-wrap items-center justify-center gap-1"
        title={description}
        aria-label={description}
      >
        <span
          className={`inline-flex min-h-7 min-w-9 items-center justify-center rounded-lg px-1.5 text-xs font-black tabular-nums ${full ? 'bg-emerald-100 text-emerald-900' : value > 0 ? 'bg-indigo-100 text-indigo-900' : 'bg-slate-100 text-slate-600'}`}
        >
          {formatScore(value)}
        </span>
        {pending && !full ? (
          <span className="text-[10px] font-bold text-amber-800">
            ?{pending}
          </span>
        ) : null}
      </span>
    );
  }
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
