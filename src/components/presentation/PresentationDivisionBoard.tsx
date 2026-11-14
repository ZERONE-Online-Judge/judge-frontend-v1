import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { ContestScoringMode } from '@/domains/contestAdministration/types';
import ScoreboardMedal from '@/components/contest/scoreboard/ScoreboardMedal';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { formatScore } from '@/domains/submissionScoreboard/scoring';
import { scoreboardRankSections } from '@/domains/submissionScoreboard/scoreboardRankSections';
import useScoreboardRowMotion from '@/domains/submissionScoreboard/useScoreboardRowMotion';
import { PRESENTATION_RANK_DURATION } from '@/domains/submissionScoreboard/presentationReleaseMotion';
import type {
  OperatorPresentationScoreboardSection,
  ScoreboardProblemScore,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';
import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import {
  presentationBoardProblems,
  presentationCellState,
} from './presentationBoardModel';
import './PresentationDivisionBoard.css';
import usePresentationRankScroll from './usePresentationRankScroll';

export type PresentationDivisionBoardProps = {
  section: OperatorPresentationScoreboardSection;
  scoringMode?: ContestScoringMode;
  activeTeamId?: string | null;
  activeProblemCode?: string | null;
  focusTeamIds?: readonly string[];
  revealFocused?: boolean;
  rankMoving?: boolean;
  fontScale?: number;
};

function ScoreNumber({
  value,
  scope,
}: {
  value?: number | null;
  scope: string;
}) {
  const display = useAnimatedValue(value, scope);
  return (
    <span className="presentation-stage-board__number">
      <span aria-hidden="true">{formatScore(display)}</span>
      <span className="sr-only">{formatScore(value)}</span>
    </span>
  );
}

function ProblemCell({
  score,
  points,
  scope,
  active,
}: {
  score?: ScoreboardProblemScore;
  points: boolean;
  scope: string;
  active: boolean;
}) {
  const { state, value, pending, label } = presentationCellState(score, points);
  return (
    <td
      className={`presentation-stage-board__problem-cell px-1 py-1.5 text-center ${active ? 'is-active-problem' : ''}`}
      aria-label={label}
    >
      {state === 'empty' ? (
        <span
          className="presentation-score presentation-stage-board__empty-mark is-empty text-white/20"
          aria-hidden="true"
        >
          -
        </span>
      ) : points && value !== undefined ? (
        <span
          className="presentation-stage-board__cell-stack inline-flex flex-wrap items-center justify-center"
          title={label}
        >
          <span
            data-score-state={state}
            className={`presentation-score presentation-stage-board__score presentation-stage-board__score-pill inline-flex h-6 min-w-8 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black ${state === 'full' ? 'is-solved is-full bg-emerald-300 text-slate-950' : value > 0 ? 'is-partial bg-violet-300 text-slate-950' : 'is-empty bg-white/10 text-white/60'}`}
          >
            <ScoreNumber value={value} scope={scope} />
          </span>
          {pending ? (
            <span className="presentation-score presentation-stage-board__pending-detail presentation-stage-board__score-pill is-pending inline-flex h-6 min-w-8 items-center justify-center rounded-full bg-amber-200 px-1.5 text-[0.68rem] font-black text-amber-950">
              ?{pending}
            </span>
          ) : null}
        </span>
      ) : pending ? (
        <span
          className="presentation-score presentation-stage-board__score presentation-stage-board__score-pill is-pending inline-flex h-6 min-w-8 items-center justify-center rounded-full bg-amber-200 px-1.5 text-[0.68rem] font-black text-amber-950"
          title={label}
        >
          ?{pending}
        </span>
      ) : (
        <span
          className={`presentation-score presentation-stage-board__score inline-flex h-6 min-w-8 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black ${score?.solved ? 'is-solved is-full bg-emerald-300 text-slate-950' : 'is-wrong bg-rose-300 text-slate-950 ring-1 ring-rose-100/35'}`}
          title={label}
        >
          {score?.solved ? (
            score.wrong_attempts > 0 ? (
              `+${score.wrong_attempts}`
            ) : (
              <InterfaceIcon name="check" size={14} label="정답" />
            )
          ) : (
            `-${score?.attempts}`
          )}
        </span>
      )}
    </td>
  );
}

function Rank({ row }: { row: ScoreboardRow }) {
  return (
    <span
      className="presentation-stage-board__rank-stack"
      aria-label={`${row.rank_is_final === false ? '프리즈 ' : row.rank_is_final === true ? '확정 ' : ''}${row.rank}위`}
    >
      <span className="presentation-stage-board__rank-value">{row.rank}</span>
    </span>
  );
}

/** A read-only board; ranks, visibility and pending counts come from the API. */
export default function PresentationDivisionBoard({
  section,
  scoringMode = section.scoring_mode ?? 'icpc',
  activeTeamId,
  activeProblemCode,
  focusTeamIds,
  revealFocused = false,
  rankMoving = false,
  fontScale = 1,
}: PresentationDivisionBoardProps) {
  const points = scoringMode === 'ioi';
  const problems = useMemo(() => presentationBoardProblems(section), [section]);
  const bodyRef = useScoreboardRowMotion(
    section.rows,
    PRESENTATION_RANK_DURATION,
  );
  const rankSections = scoreboardRankSections(section.rows);
  const lastEvent = section.release?.resolver?.last_event;
  const highlightedTeam =
    activeTeamId === undefined ? lastEvent?.team_id : activeTeamId;
  const highlightedProblem =
    activeProblemCode === undefined
      ? lastEvent?.problem_code
      : activeProblemCode;
  const highlightedTeams = useMemo(
    () =>
      new Set(
        focusTeamIds ?? (highlightedTeam == null ? [] : [highlightedTeam]),
      ),
    [focusTeamIds, highlightedTeam],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFocusScroll = useRef('');
  const focusKey = JSON.stringify([
    section.division.division_id,
    [...highlightedTeams],
    highlightedProblem,
  ]);
  useLayoutEffect(() => {
    if (!revealFocused) {
      lastFocusScroll.current = '';
      return;
    }
    if (lastFocusScroll.current === focusKey) return;
    const body = bodyRef.current;
    const scroll = scrollRef.current;
    const target =
      body &&
      [
        ...body.querySelectorAll<HTMLTableRowElement>('[data-scoreboard-row]'),
      ].find((row) => highlightedTeams.has(row.dataset.scoreboardRow ?? ''));
    if (!target || !scroll) return;
    lastFocusScroll.current = focusKey;

    // Focus the still-published snapshot once, before the result takes the stage.
    // Instant positioning leaves the short focus animation fully visible and
    // only moves this division's table, never the surrounding presentation.
    const bounds = scroll.getBoundingClientRect();
    const rowRect = target.getBoundingClientRect();
    const headingHeight =
      scroll.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const visibleTop = Math.max(0, bounds.top) + headingHeight + 8;
    const visibleBottom = Math.min(window.innerHeight, bounds.bottom) - 8;
    if (
      scroll.clientHeight > 0 &&
      (rowRect.top < visibleTop || rowRect.bottom > visibleBottom)
    ) {
      const delta =
        (rowRect.top + rowRect.bottom - visibleTop - visibleBottom) / 2;
      scroll.scrollTo?.({
        top: Math.max(
          0,
          Math.min(
            scroll.scrollHeight - scroll.clientHeight,
            scroll.scrollTop + delta,
          ),
        ),
        behavior: 'instant',
      });
    }
    const problemIndex = problems.findIndex(
      (problem) => problem.code === highlightedProblem,
    );
    if (problemIndex < 0 || scroll.clientWidth <= 0) return;
    const cell =
      target.querySelectorAll<HTMLElement>(
        '.presentation-stage-board__problem-cell',
      )[problemIndex] ??
      scroll.querySelectorAll<HTMLElement>(
        '.presentation-stage-board__problem-heading',
      )[problemIndex];
    if (!cell) return;
    const pinnedWidth = ['rank-heading', 'team-heading'].reduce(
      (width, name) => {
        const heading = scroll.querySelector<HTMLElement>(
          `.presentation-stage-board__${name}`,
        );
        const style = heading ? window.getComputedStyle(heading) : null;
        // A vertically sticky header does not cover horizontal table space.
        const pinned =
          style?.position === 'sticky' &&
          style.left !== 'auto' &&
          style.left !== '';
        return (
          width +
          (heading && pinned ? heading.getBoundingClientRect().width : 0)
        );
      },
      0,
    );
    const visibleLeft = bounds.left + pinnedWidth;
    const cellBounds = cell.getBoundingClientRect();
    if (
      cellBounds.left < visibleLeft + 8 ||
      cellBounds.right > bounds.right - 8
    ) {
      const delta =
        (cellBounds.left + cellBounds.right - visibleLeft - bounds.right) / 2;
      scroll.scrollTo?.({
        left: Math.max(
          0,
          Math.min(
            scroll.scrollWidth - scroll.clientWidth,
            scroll.scrollLeft + delta,
          ),
        ),
        behavior: 'instant',
      });
    }
  }, [
    revealFocused,
    focusKey,
    highlightedTeams,
    highlightedProblem,
    problems,
    bodyRef,
  ]);
  const columnCount = problems.length + (points ? 3 : 4);
  const scope = `${section.division.division_id}:${scoringMode}`;
  usePresentationRankScroll({
    bodyRef,
    scrollRef,
    rows: section.rows,
    teamIds: highlightedTeams,
    rankMoving,
    scopeKey: scope,
  });

  return (
    <section
      className="presentation-board presentation-stage-board min-w-0 overflow-hidden rounded-[0.85rem] border border-indigo-300/15 bg-slate-950/55 p-[clamp(0.8rem,1.4vw,1.2rem)] shadow-[0_1.25rem_4rem_rgba(0,0,0,0.28)] backdrop-blur"
      data-scoring-mode={scoringMode}
      data-presentation-division={section.division.division_id}
      data-reveal-focused={revealFocused || undefined}
      data-large-type={fontScale > 1.5 || undefined}
      aria-label={`${section.division.name} ${points ? '점수제' : 'ICPC'} 순위표`}
    >
      <header className="presentation-board-header presentation-stage-board__header flex items-end justify-between gap-3 pb-3">
        <div className="presentation-stage-board__heading min-w-0">
          <p className="presentation-board-meta text-[0.6rem] font-black tracking-[0.28em] text-violet-300 uppercase">
            Division
          </p>
          <h2
            className="presentation-board-title presentation-stage-board__title truncate text-[clamp(1.35rem,2.4vw,2.45rem)] leading-none font-black tracking-normal text-white"
            title={section.division.name}
          >
            {section.division.name}
          </h2>
        </div>
      </header>
      <div
        className="presentation-board-scroll presentation-stage-board__scroll overflow-auto"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={`${section.division.name} 순위표, 가로와 세로로 스크롤하여 모든 팀과 문제 확인`}
      >
        <table
          className="presentation-board-table presentation-stage-board__table w-full border-collapse text-left"
          style={{ '--stage-problem-count': problems.length } as CSSProperties}
        >
          <caption className="sr-only">
            {section.division.name} 순위표.{' '}
            {points
              ? '문제별 최고 점수를 합산합니다. 같은 총점은 공동 순위입니다.'
              : '풀이 수와 페널티 기준입니다.'}
          </caption>
          <colgroup>
            <col className="presentation-stage-board__col-rank" />
            <col className="presentation-stage-board__col-team" />
            <col className="presentation-stage-board__col-total" />
            {problems.map((problem) => (
              <col
                className="presentation-stage-board__col-problem"
                key={problem.code}
              />
            ))}
            {!points ? (
              <col className="presentation-stage-board__col-penalty" />
            ) : null}
          </colgroup>
          <thead>
            <tr className="border-y border-white/10 text-[0.62rem] font-black tracking-normal text-white/85 uppercase">
              <th
                scope="col"
                className="presentation-stage-board__rank-heading px-3 py-3"
                aria-label="순위"
              >
                <span
                  className="presentation-stage-board__label-full"
                  aria-hidden="true"
                >
                  Rank
                </span>
                <span
                  className="presentation-stage-board__label-short"
                  aria-hidden="true"
                >
                  #
                </span>
              </th>
              <th
                scope="col"
                className="presentation-stage-board__team-heading px-3 py-3"
              >
                Team
              </th>
              <th
                scope="col"
                className="presentation-stage-board__total-heading px-2 py-3 text-center"
                aria-label={points ? '총점' : '푼 문제 수'}
              >
                <span
                  className="presentation-stage-board__label-full"
                  aria-hidden="true"
                >
                  {points ? 'Score' : 'Solved'}
                </span>
                <span
                  className="presentation-stage-board__label-short"
                  aria-hidden="true"
                >
                  {points ? 'Pts' : 'AC'}
                </span>
              </th>
              {problems.map((problem) => (
                <th
                  scope="col"
                  className={`presentation-stage-board__problem-heading px-1 py-3 text-center ${highlightedProblem === problem.code ? 'is-active-problem' : ''}`}
                  key={problem.code}
                  title={`${problem.code}${problem.title ? `. ${problem.title}` : ''}${points && problem.maxScore !== undefined ? ` · ${formatScore(problem.maxScore)}점` : ''}`}
                  aria-label={`${problem.code}${problem.title ? `. ${problem.title}` : ''}${points && problem.maxScore !== undefined ? ` · ${formatScore(problem.maxScore)}점` : ''}`}
                >
                  <span className="presentation-stage-board__problem-code">
                    {problem.code}
                  </span>
                </th>
              ))}
              {!points ? (
                <th
                  scope="col"
                  className="presentation-stage-board__penalty-heading px-3 py-3 text-center"
                >
                  Time
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rankSections.flatMap((rankSection) => [
              ...(rankSection.label
                ? [
                    <tr key={`rank-section-${rankSection.key}`}>
                      <th
                        colSpan={columnCount}
                        className="presentation-stage-board__section-row border-y border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-white/75"
                        data-scoreboard-rank-section={rankSection.key}
                        aria-label={rankSection.label}
                      />
                    </tr>,
                  ]
                : []),
              ...rankSection.rows.map((row) => {
                const rowId =
                  row.team_id ??
                  (row.is_revealed === false
                    ? `unrevealed-${row.rank}`
                    : row.team_name);
                const rowScope = `${scope}:${rowId}`;
                const active =
                  row.team_id != null && highlightedTeams.has(row.team_id);
                if (row.is_revealed === false)
                  return (
                    <tr
                      key={rowId}
                      data-scoreboard-row={rowId}
                      data-active-team={active || undefined}
                      data-rank-moving={(rankMoving && active) || undefined}
                      className={`presentation-board-row presentation-stage-board__row is-waiting border-b border-white/10 bg-white/[0.03] ${active ? 'is-active' : ''}`}
                    >
                      <td className="presentation-board-rank presentation-stage-board__rank px-3 py-4 text-lg font-black text-violet-300">
                        <Rank row={row} />
                      </td>
                      <td
                        colSpan={columnCount - 1}
                        className="presentation-board-meta presentation-stage-board__waiting px-3 py-4 text-sm font-bold text-white/35"
                        aria-label="미공개 참가팀"
                      />
                    </tr>
                  );
                const scores = new Map(
                  row.problem_scores.map((score) => [
                    score.problem_code,
                    score,
                  ]),
                );
                return (
                  <tr
                    key={rowId}
                    data-scoreboard-row={rowId}
                    data-active-team={active || undefined}
                    data-rank-moving={(rankMoving && active) || undefined}
                    className={`presentation-board-row presentation-stage-board__row border-b border-white/5 last:border-b-0 ${active ? 'is-active bg-violet-500/25' : row.is_revealed ? 'is-revealed bg-violet-500/15' : 'odd:bg-white/[0.035]'}`}
                  >
                    <td className="presentation-board-rank presentation-stage-board__rank px-3 py-2.5 text-[clamp(0.9rem,1.3vw,1.15rem)] font-black text-violet-300">
                      <Rank row={row} />
                    </td>
                    <td className="presentation-stage-board__team px-3 py-2.5">
                      <span className="presentation-stage-board__team-line flex min-w-0 items-center gap-2">
                        <span
                          className="presentation-board-team presentation-stage-board__team-name truncate text-[clamp(0.8rem,1vw,0.92rem)] font-semibold text-white"
                          title={row.team_name}
                        >
                          {row.team_name}
                        </span>
                        <ScoreboardMedal release={section.release} row={row} />
                      </span>
                    </td>
                    <td
                      className="presentation-board-solved presentation-stage-board__total px-2 py-2.5 text-center text-[clamp(0.9rem,1.15vw,1.05rem)] font-black text-white/65"
                      title={
                        points
                          ? `${formatScore(row.total_score)}${typeof row.max_score === 'number' && Number.isFinite(row.max_score) ? ` / ${formatScore(row.max_score)}` : ''}점`
                          : undefined
                      }
                      aria-label={
                        points
                          ? `${formatScore(row.total_score)}${typeof row.max_score === 'number' && Number.isFinite(row.max_score) ? ` / ${formatScore(row.max_score)}` : ''}점`
                          : undefined
                      }
                    >
                      <ScoreNumber
                        value={points ? row.total_score : row.solved}
                        scope={`${rowScope}:total`}
                      />
                    </td>
                    {problems.map((problem) => (
                      <ProblemCell
                        key={problem.code}
                        score={scores.get(problem.code)}
                        points={points}
                        scope={`${rowScope}:${problem.code}`}
                        active={active && highlightedProblem === problem.code}
                      />
                    ))}
                    {!points ? (
                      <td className="presentation-board-penalty presentation-stage-board__penalty px-3 py-2.5 text-center text-[clamp(0.9rem,1.15vw,1.05rem)] font-black text-white/65">
                        <ScoreNumber
                          value={row.penalty}
                          scope={`${rowScope}:penalty`}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
      {section.rows.length === 0 ? (
        <p className="presentation-board-meta presentation-stage-board__empty px-5 py-8 text-center text-sm font-bold text-white/50">
          표시할 팀이 없습니다.
        </p>
      ) : null}
    </section>
  );
}
