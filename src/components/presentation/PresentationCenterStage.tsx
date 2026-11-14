import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useEffect, useState } from 'react';
import {
  useAnimatedValue,
  useReducedMotion,
} from '@/shared/hooks/useAnimatedValue';
import { formatScore } from '@/domains/submissionScoreboard/scoring';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';
import type { PresentationReveal } from '@/domains/submissionScoreboard/presentationReleaseMotion';
import type { ScoreboardRow } from '@/domains/submissionScoreboard/types';
import './PresentationCenterStage.css';

function nameDensity(value: string) {
  return value.length > 90
    ? 'very-long'
    : value.length > 36
      ? 'long'
      : 'normal';
}

function ResultTeam({ row }: { row: ScoreboardRow }) {
  return (
    <span
      className="presentation-center-team"
      data-density={nameDensity(row.team_name)}
    >
      {row.team_name}
    </span>
  );
}

function SuspenseQuestion({
  points,
  kind,
}: {
  points: boolean;
  kind: PresentationReveal['kind'];
}) {
  return (
    <div className="presentation-center-suspense">
      <strong className="presentation-center-question" aria-hidden="true">
        ?
      </strong>
      <p>
        {kind === 'resolver'
          ? points
            ? '몇 점일까요?'
            : '결과는?'
          : kind === 'rank'
            ? '어떤 팀일까요?'
            : '최종 결과는?'}
      </p>
      <span className="presentation-center-suspense-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function RevealScore({
  from,
  to,
  scope,
}: {
  from?: number | null;
  to?: number | null;
  scope: string;
}) {
  const reduced = useReducedMotion();
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => setArrived(true), 220);
    return () => window.clearTimeout(timer);
  }, [reduced]);
  const display = useAnimatedValue(
    reduced || arrived ? to : (from ?? to),
    scope,
    440,
  );
  return (
    <strong className="presentation-center-score-value">
      <span aria-hidden="true" data-display={formatScore(display)} />
      <span className="sr-only">{formatScore(to)}</span>
    </strong>
  );
}

/** Read-only projection of the exact public snapshot that is being revealed. */
export default function PresentationCenterStage({
  reveal,
  stage,
  contestTitle,
}: {
  reveal: PresentationReveal;
  stage: 'board' | 'suspense' | 'result' | 'returning';
  contestTitle: string;
}) {
  const { section, previous, teams, kind } = reveal;
  const suspense = stage === 'suspense';
  const points = section.scoring_mode === 'ioi';
  const event =
    kind === 'resolver' ? section.release?.resolver?.last_event : null;
  const row = event
    ? section.rows.find(
        (item) => item.team_id === event.team_id && item.is_revealed !== false,
      )
    : teams[0];
  const before = previous.rows.find((item) => item.team_id === row?.team_id);
  const score = row?.problem_scores.find(
    (item) => item.problem_code === event?.problem_code,
  );
  const oldScore = before?.problem_scores.find(
    (item) => item.problem_code === event?.problem_code,
  );
  const problem = section.problems.find(
    (item) => item.problem_code === event?.problem_code,
  );
  const fromScore = event?.from_score ?? oldScore?.score;
  const toScore = event?.to_score ?? score?.score;
  const delta =
    typeof fromScore === 'number' && typeof toScore === 'number'
      ? toScore - fromScore
      : event?.score_delta;
  const improved = points ? (delta ?? 0) > 0 : event?.status === 'accepted';
  const maxScore = score?.max_score ?? oldScore?.max_score ?? 100;
  const full = points && typeof toScore === 'number' && toScore >= maxScore;
  const tone =
    kind !== 'resolver'
      ? 'rank'
      : points
        ? full
          ? 'success'
          : improved
            ? 'partial'
            : 'unchanged'
        : improved
          ? 'success'
          : 'failure';
  const tied = kind === 'rank' && teams.length > 1;
  const sharedPlace =
    event &&
    section.rows.filter(
      (item) => item.is_revealed !== false && item.rank === event.to_rank,
    ).length > 1;
  const placeLabel = event
    ? `${sharedPlace ? '공동 ' : ''}${event.to_rank}위`
    : '';
  const totalTeams = section.release?.total_count || section.rows.length;

  return (
    <aside
      className="presentation-center-stage"
      data-stage={stage}
      data-kind={kind}
      data-tone={suspense ? 'pending' : tone}
      data-many-teams={
        (!suspense && kind === 'rank' && teams.length > 4) || undefined
      }
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={
        suspense
          ? '잠시 후 결과를 공개합니다'
          : kind === 'resolver'
            ? `팀과 문제 결과 공개 · ${points ? 'IOI 점수제' : 'ICPC'}`
            : kind === 'rank'
              ? '최종 순위 공개'
              : '전체 결과 공개'
      }
    >
      <div className="presentation-center-topline">
        <span className="sr-only">{contestTitle}</span>
        <span className="presentation-center-division">
          {section.division.name}
        </span>
      </div>
      <div className="presentation-center-body">
        {suspense && kind !== 'resolver' ? (
          <SuspenseQuestion points={points} kind={kind} />
        ) : kind === 'all' ? (
          <>
            <h2 className="presentation-center-headline">
              모든 결과를 공개합니다
            </h2>
            <p className="presentation-center-all-count">
              {totalTeams.toLocaleString('ko-KR')}팀의 최종 순위
            </p>
          </>
        ) : kind === 'rank' ? (
          <>
            <div className="presentation-center-place">
              {tied ? (
                <span className="presentation-center-tie">공동</span>
              ) : null}
              <strong>{row?.rank}</strong>
              <span>위</span>
            </div>
            <div
              className="presentation-center-teams"
              data-count={teams.length}
            >
              {teams
                .filter((team) => team.is_revealed !== false)
                .map((team) => (
                  <div
                    key={team.team_id ?? team.team_name}
                    className="presentation-center-ranked-team"
                  >
                    <ResultTeam row={team} />
                    {points ? (
                      <span className="presentation-center-team-points">
                        {formatScore(team.total_score)}점
                      </span>
                    ) : null}
                  </div>
                ))}
            </div>
            {tied ? (
              <p className="presentation-center-note">
                {teams.length}팀이 같은 순위를 기록했습니다.
              </p>
            ) : null}
          </>
        ) : row && event ? (
          <>
            <h2 className="presentation-center-team-heading">
              <ResultTeam row={row} />
            </h2>
            <div className="presentation-center-problem">
              <h3 data-density={nameDensity(problem?.title ?? '')}>
                <span
                  className="presentation-center-problem-code"
                  data-density={nameDensity(event.problem_code)}
                >
                  {event.problem_code}
                </span>{' '}
                <span className="presentation-center-problem-title">
                  {problem?.title || '문제 결과'}
                </span>
              </h3>
            </div>
            {suspense ? (
              <SuspenseQuestion points={points} kind={kind} />
            ) : points ? (
              <div className="presentation-center-ioi-result">
                <div className="presentation-center-score-change">
                  <span className="presentation-center-score-origin">
                    <span className="presentation-center-score-before">
                      {formatScore(fromScore)}
                    </span>
                    <InterfaceIcon name="arrowRight" size={32} />
                  </span>
                  <RevealScore
                    key={reveal.key}
                    from={fromScore}
                    to={toScore}
                    scope={reveal.key}
                  />
                  <span className="presentation-center-unit">
                    / {formatScore(maxScore)}점
                  </span>
                </div>
                <p className="presentation-center-score-detail">
                  <strong>
                    {typeof delta === 'number' && delta > 0
                      ? `+${formatScore(delta)}점`
                      : '점수 변화 없음'}
                  </strong>
                  {full ? <span>만점</span> : null}
                </p>
              </div>
            ) : (
              <div className="presentation-center-verdict">
                <InterfaceIcon name={improved ? 'check' : 'minus'} size={48} />
                <strong>
                  {event.status === 'accepted'
                    ? '정답입니다'
                    : submissionStatusLabel(event.status)}
                </strong>
              </div>
            )}
            {!suspense ? (
              <div className="presentation-center-metrics">
                <span>
                  <small>{points ? '팀 총점' : '해결 문제'}</small>
                  <b>
                    {points
                      ? formatScore(row.total_score)
                      : `${row.solved}문제`}
                  </b>
                  {points && row.max_score != null ? (
                    <em>/ {formatScore(row.max_score)}점</em>
                  ) : null}
                </span>
                <span>
                  <small>순위</small>
                  <b>
                    {event.from_rank === event.to_rank
                      ? `${placeLabel} 유지`
                      : `${event.from_rank} → ${placeLabel}`}
                  </b>
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
