import { compareProblemsByCode } from '@/domains/problemManagement/problemCodeOrder';
import ContestScoreboardProblemCell from '@/components/contest/scoreboard/ContestScoreboardProblemCell';
import ScoreboardMedal from '@/components/contest/scoreboard/ScoreboardMedal';
import useScoreboardRowMotion from '@/domains/submissionScoreboard/useScoreboardRowMotion';
import { scoreboardRankSections } from '@/domains/submissionScoreboard/scoreboardRankSections';
import type { Problem } from '@/domains/problemManagement/types';
import type {
  ScoreboardProblemScore,
  ScoreboardRelease,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';

type ContestScoreboardTableProps = {
  onSelectPenaltyBreakdown?: (row: ScoreboardRow) => void;
  problems?: Problem[];
  release?: ScoreboardRelease | null;
  rows: ScoreboardRow[];
};

function scoreboardProblems(rows: ScoreboardRow[], problems: Problem[]) {
  const problemMap = new Map<string, ScoreboardProblemScore>();

  problems.forEach((problem) => {
    problemMap.set(problem.problem_code, {
      problem_id: problem.problem_id,
      problem_code: problem.problem_code,
      attempts: 0,
      wrong_attempts: 0,
      solved: false,
      best_status: null,
    });
  });

  rows.forEach((row) => {
    row.problem_scores.forEach((score) => {
      if (!problemMap.has(score.problem_code)) {
        problemMap.set(score.problem_code, score);
      }
    });
  });

  return Array.from(problemMap.values()).sort(compareProblemsByCode);
}

function totalPenalty(row: ScoreboardRow) {
  const value = row.penalty;
  if (value === undefined || value === null) return '-';

  return value.toLocaleString('ko-KR');
}

function submissionCount(row: ScoreboardRow) {
  return row.submission_count?.toLocaleString('ko-KR') ?? '-';
}

export default function ContestScoreboardTable({
  onSelectPenaltyBreakdown,
  problems = [],
  release,
  rows,
}: ContestScoreboardTableProps) {
  const scoreboardProblemScores = scoreboardProblems(rows, problems);
  const rankSections = scoreboardRankSections(rows);
  const bodyRef = useScoreboardRowMotion(rows);
  const headerCellClassName =
    'border-r border-slate-200 px-5 py-4 last:border-r-0';
  const bodyCellClassName =
    'border-r border-slate-200 px-5 py-5 font-medium text-slate-950 last:border-r-0';
  const problemHeaderCellClassName =
    'w-12 border-r border-slate-200 px-2 py-4 text-center last:border-r-0';
  const problemBodyCellClassName =
    'border-r border-slate-200 px-2 py-4 text-center last:border-r-0';

  return (
    <div
      className="zoj-scoreboard-scroll overflow-x-auto rounded-xl border border-slate-200 bg-white"
      role="region"
      aria-label="대회 순위표, 좌우로 스크롤하여 문제별 결과 확인"
      tabIndex={0}
    >
      <table
        className="zoj-scoreboard-table w-full border-separate border-spacing-0 text-left text-sm"
        style={{
          minWidth: `calc(var(--zoj-scoreboard-base-width, 360px) + ${scoreboardProblemScores.length} * var(--zoj-scoreboard-problem-width, 64px))`,
        }}
      >
        <caption className="sr-only">팀별 순위와 문제별 해결 현황</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-white text-xs font-black text-slate-950">
            <th className={`${headerCellClassName} zoj-score-rank`}>순위</th>
            <th className={`${headerCellClassName} zoj-score-team`}>팀명</th>
            <th className={`${headerCellClassName} w-24`}>해결</th>
            <th className={`${headerCellClassName} w-24`}>시도</th>
            {scoreboardProblemScores.map((problem) => (
              <th
                className={problemHeaderCellClassName}
                key={problem.problem_code}
              >
                {problem.problem_code}
              </th>
            ))}
            <th className={`${headerCellClassName} w-32`}>총시간(min)</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rankSections.flatMap((section) => [
            ...(section.label
              ? [
                  <tr key={`rank-section-${section.key}`}>
                    <th
                      colSpan={5 + scoreboardProblemScores.length}
                      className="border-y border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-600"
                      data-scoreboard-rank-section={section.key}
                    >
                      {section.label}
                    </th>
                  </tr>,
                ]
              : []),
            ...section.rows.map((row) =>
              row.is_revealed === false ? (
                <tr
                  key={row.team_id}
                  data-scoreboard-row={row.team_id}
                  className="border-b border-slate-200 bg-slate-100/70"
                >
                  <td
                    className={`${bodyCellClassName} zoj-score-rank`}
                    aria-label={
                      row.rank_is_final === false
                        ? `프리즈 ${row.rank}위`
                        : undefined
                    }
                  >
                    {row.rank_is_final === false ? (
                      <span className="mb-1 block text-[0.65rem] font-medium text-slate-500">
                        프리즈
                      </span>
                    ) : null}
                    {row.rank}위
                  </td>
                  <td
                    colSpan={4 + scoreboardProblemScores.length}
                    className="px-5 py-5 text-sm font-bold text-slate-400"
                  >
                    아직 공개되지 않은 순위
                  </td>
                </tr>
              ) : (
                <tr
                  className="border-b border-slate-200 last:border-b-0 odd:bg-slate-50/80"
                  key={row.team_id ?? row.team_name}
                  data-scoreboard-row={row.team_id ?? row.team_name}
                >
                  <td
                    className={`${bodyCellClassName} zoj-score-rank font-semibold`}
                    aria-label={
                      row.rank_is_final === undefined
                        ? undefined
                        : `${row.rank_is_final ? '확정' : '프리즈'} ${row.rank}위`
                    }
                  >
                    {row.rank_is_final === false ? (
                      <span className="mb-1 block text-[0.65rem] font-medium text-slate-500">
                        프리즈
                      </span>
                    ) : null}
                    {row.rank}위
                  </td>
                  <td
                    className={`${bodyCellClassName} zoj-score-team font-semibold`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{row.team_name}</span>
                      <ScoreboardMedal release={release} row={row} />
                    </span>
                  </td>
                  <td className={`${bodyCellClassName} font-bold`}>
                    {row.solved}개
                  </td>
                  <td className={bodyCellClassName}>{submissionCount(row)}</td>
                  {scoreboardProblemScores.map((problem) => {
                    const score = row.problem_scores.find(
                      (item) => item.problem_code === problem.problem_code,
                    );

                    return (
                      <td
                        className={problemBodyCellClassName}
                        key={problem.problem_code}
                      >
                        <ContestScoreboardProblemCell score={score} />
                      </td>
                    );
                  })}
                  <td className={bodyCellClassName}>
                    {onSelectPenaltyBreakdown ? (
                      <button
                        className="font-black text-indigo-700 underline-offset-4 hover:text-indigo-950 hover:underline"
                        onClick={() => onSelectPenaltyBreakdown(row)}
                        title="패널티 계산 상세 보기"
                        type="button"
                      >
                        {totalPenalty(row)}
                      </button>
                    ) : (
                      totalPenalty(row)
                    )}
                  </td>
                </tr>
              ),
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}
