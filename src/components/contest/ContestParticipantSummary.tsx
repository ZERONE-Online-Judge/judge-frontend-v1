import { contestTimerState } from '@/domains/contestAdministration/contestTimer';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import {
  canViewContestResource,
  contestResourceAccess,
} from '@/domains/contestAdministration/logic';
import type { Contest } from '@/domains/contestAdministration/types';
import type { Problem } from '@/domains/problemManagement/types';
import { getDivisionProblems } from '@/domains/problemManagement/api';
import { getDivisionScoreboard } from '@/domains/submissionScoreboard/api';
import { useClockTick } from '@/shared/hooks/useAutoRefresh';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import './ContestParticipantSummary.css';

export default function ContestParticipantSummary({
  contest,
}: {
  contest: Contest;
}) {
  const contestId = contest.contest_id;
  const {
    activeParticipantSession,
    participantContest,
    generalSession,
    ensureParticipantSession,
    divisionId,
    isPreview,
  } = useContestParticipantSession(contestId);
  const now = useClockTick();
  const visible = useDocumentVisibility();
  const phase = contestTimerState(contest, now).phase;
  const started = isPreview || phase === 'running' || phase === 'ended';
  const hasAccess = Boolean(participantContest || activeParticipantSession);
  const scoreboardAllowed =
    !isPreview &&
    started &&
    hasAccess &&
    canViewContestResource(
      contest,
      hasAccess,
      contestResourceAccess(contest, 'scoreboard'),
    );
  const problemsAllowed =
    started &&
    hasAccess &&
    (isPreview ||
      canViewContestResource(
        contest,
        hasAccess,
        contestResourceAccess(contest, 'problem'),
      ));
  const generalIdentity = generalSessionQueryIdentity(generalSession);
  const participantIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );
  const participantContestId =
    activeParticipantSession?.contestId ??
    participantContest?.contest.contest_id;
  const board = useQuery({
    queryKey: contestQueryKeys.scoreboard(
      contestId,
      generalIdentity,
      participantContestId,
      divisionId,
      participantIdentity,
    ),
    enabled: scoreboardAllowed && Boolean(divisionId),
    queryFn: async () => {
      const session = await ensureParticipantSession();
      if (!session) throw new Error('참가자 세션이 필요합니다.');
      // This endpoint always applies the public freeze/release policy on the server.
      return getDivisionScoreboard(
        contestId,
        session.division.division_id,
        session.accessToken,
      );
    },
    refetchInterval: visible ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const problems = useQuery({
    queryKey: contestQueryKeys.problems(
      contestId,
      generalIdentity,
      participantContestId,
      divisionId,
      participantIdentity,
    ),
    enabled: problemsAllowed && Boolean(divisionId),
    queryFn: async () => {
      const session = await ensureParticipantSession();
      if (!session) throw new Error('참가자 세션이 필요합니다.');
      return getDivisionProblems(
        contestId,
        session.division.division_id,
        session.accessToken,
      );
    },
    refetchInterval: visible ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const teamId = participantContest?.team.participant_team_id;
  const teamName =
    activeParticipantSession?.team.team_name ??
    participantContest?.team.team_name;
  const row = board.data?.rows.find((item) =>
    teamId ? item.team_id === teamId : item.team_name === teamName,
  );
  const rank =
    scoreboardAllowed && !board.isError && row && row.is_revealed !== false
      ? row.rank
      : null;
  const list = problemsAllowed && !problems.isError ? problems.data : undefined;
  const ordered = list
    ? [...list].sort(
        (a, b) =>
          (a.display_order ?? 0) - (b.display_order ?? 0) ||
          a.problem_code.localeCompare(b.problem_code, 'ko-KR', {
            numeric: true,
          }),
      )
    : undefined;
  const emptyMessage = !started
    ? '대회 시작 후 표시됩니다.'
    : !problemsAllowed
      ? '문제 공개 후 표시됩니다.'
      : problems.isError
        ? '풀이 현황을 불러오지 못했습니다.'
        : '풀이 현황을 불러오는 중입니다.';
  const rankNote = isPreview
    ? '참가자 미리보기에는 등수가 없습니다.'
    : !started
      ? '대회 시작 후 집계됩니다.'
      : !scoreboardAllowed
        ? '순위 공개 후 표시됩니다.'
        : board.isError
          ? '순위를 불러오지 못했습니다.'
          : row?.is_revealed === false
            ? '결과 공개 대기'
            : board.data?.frozen
              ? '프리즈 순위 기준'
              : board.data
                ? '공개 스코어보드 기준'
                : '순위를 불러오는 중입니다.';
  return (
    <ParticipantSummaryCards
      contestId={contestId}
      rank={rank}
      rankNote={rankNote}
      problems={ordered}
      emptyMessage={emptyMessage}
    />
  );
}

export function ParticipantSummaryCards({
  contestId,
  rank,
  rankNote,
  problems,
  emptyMessage,
}: {
  contestId: string;
  rank: number | null;
  rankNote: string;
  problems?: Problem[];
  emptyMessage: string;
}) {
  const solved = problems?.filter(
    (problem) => problem.solve_status === 'accepted',
  );
  const unsolved = problems?.filter(
    (problem) => problem.solve_status !== 'accepted',
  );
  return (
    <section
      className="contest-participant-summary"
      aria-label="내 팀의 대회 현황"
    >
      <div className="zoj-card contest-participant-rank">
        <p>현재 등수</p>
        <strong>
          {rank !== null ? (
            <>
              {rank}
              <small>위</small>
            </>
          ) : (
            '—'
          )}
        </strong>
        <span>{rankNote}</span>
      </div>
      <ProblemGroup
        title="푼 문제"
        problems={solved}
        contestId={contestId}
        emptyMessage={emptyMessage}
        solved
      />
      <ProblemGroup
        title="아직 못 푼 문제"
        problems={unsolved}
        contestId={contestId}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}
function ProblemGroup({
  title,
  problems,
  contestId,
  emptyMessage,
  solved = false,
}: {
  title: string;
  problems?: Problem[];
  contestId: string;
  emptyMessage: string;
  solved?: boolean;
}) {
  return (
    <div className="zoj-card contest-participant-problems" data-solved={solved}>
      <h2>
        {title}
        <span>{problems ? `${problems.length}개` : '—'}</span>
      </h2>
      {problems ? (
        problems.length ? (
          <ul>
            {problems.map((problem) => (
              <li key={problem.problem_id}>
                <Link
                  to={`/contests/${contestId}/problems/${problem.problem_id}`}
                  title={problem.title}
                >
                  {problem.problem_code}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {solved ? '아직 푼 문제가 없습니다.' : '모든 문제를 풀었습니다.'}
          </p>
        )
      ) : (
        <p>{emptyMessage}</p>
      )}
    </div>
  );
}
