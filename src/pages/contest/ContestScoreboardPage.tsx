import { pollDelay } from '@/shared/query/polling';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageShell from '@/components/contest/ContestPageShell';
import ContestScoreboardTable from '@/components/contest/scoreboard/ContestScoreboardTable';
import ContestScoreboardTabs from '@/components/contest/scoreboard/ContestScoreboardTabs';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccessMessage,
  contestResourceAccess,
} from '@/domains/contestAdministration/logic';
import type { Contest, Division } from '@/domains/contestAdministration/types';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import {
  getContestProblems,
  getDivisionProblems,
} from '@/domains/problemManagement/api';
import {
  getDivisionScoreboard,
  getScoreboard,
} from '@/domains/submissionScoreboard/api';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import PageNotice from '@/shared/ui/PageNotice';

function ContestScoreboardContent({
  contest,
  contestId,
  divisions,
}: {
  contest: Contest;
  contestId: string;
  divisions: Division[];
}) {
  const isDocumentVisible = useDocumentVisibility();
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
  } = useContestParticipantSession(contestId);
  const divisionName =
    participantContest?.division.name ??
    activeParticipantSession?.division.name;
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const scoreboardAccess = contestResourceAccess(contest, 'scoreboard');
  const problemAccess = contestResourceAccess(contest, 'problem');
  const phase = isPreview ? 'running' : contestAccessPhase(contest);
  const isEnded = phase === 'ended';
  const isBeforeStart = phase === 'before';
  const [publicDivisionId, setPublicDivisionId] = useState('');
  const selectedPublicDivisionId = divisions.some(
    (division) => division.division_id === publicDivisionId,
  )
    ? publicDivisionId
    : (divisions[0]?.division_id ?? '');
  const shouldUseParticipantScope = hasSessionAccess && !isEnded;
  const shouldUseParticipantAuth =
    isEnded &&
    hasSessionAccess &&
    (scoreboardAccess === 'participants' || problemAccess === 'participants');
  const shouldShowDivisionSelect =
    !shouldUseParticipantScope && divisions.length > 1;
  const effectiveDivisionId = shouldUseParticipantScope
    ? activeParticipantSession?.division.division_id
    : selectedPublicDivisionId;
  const canViewScoreboard =
    isPreview ||
    (canViewContestResource(contest, hasSessionAccess, scoreboardAccess) &&
      !isBeforeStart);
  const canViewProblems =
    isPreview ||
    (canViewContestResource(contest, hasSessionAccess, problemAccess) &&
      !isBeforeStart);
  const generalQueryIdentity = generalSessionQueryIdentity(generalSession);
  const participantQueryIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );

  const problemsQuery = useQuery({
    enabled: canViewScoreboard && canViewProblems,
    queryKey: contestQueryKeys.problems(
      contestId,
      generalQueryIdentity,
      shouldUseParticipantScope
        ? (activeParticipantSession?.contestId ??
            participantContest?.contest.contest_id)
        : undefined,
      shouldUseParticipantScope
        ? (activeParticipantSession?.division.division_id ??
            participantContest?.division.division_id)
        : effectiveDivisionId,
      shouldUseParticipantScope
        ? participantQueryIdentity
        : shouldUseParticipantAuth
          ? participantQueryIdentity
          : undefined,
    ),
    queryFn: async () => {
      const session =
        shouldUseParticipantScope || shouldUseParticipantAuth
          ? await ensureParticipantSession()
          : null;
      if (session && shouldUseParticipantScope) {
        return getDivisionProblems(
          contestId,
          session.division.division_id,
          session.accessToken,
        );
      }
      if (effectiveDivisionId) {
        return getDivisionProblems(
          contestId,
          effectiveDivisionId,
          session?.accessToken ?? generalSession?.accessToken,
        );
      }

      return getContestProblems(
        contestId,
        session?.accessToken ?? generalSession?.accessToken,
      );
    },
  });

  const scoreboardQuery = useQuery({
    enabled: canViewScoreboard,
    queryKey: contestQueryKeys.scoreboard(
      contestId,
      generalQueryIdentity,
      shouldUseParticipantScope
        ? (activeParticipantSession?.contestId ??
            participantContest?.contest.contest_id)
        : undefined,
      shouldUseParticipantScope
        ? (activeParticipantSession?.division.division_id ??
            participantContest?.division.division_id)
        : effectiveDivisionId,
      shouldUseParticipantScope
        ? participantQueryIdentity
        : shouldUseParticipantAuth
          ? participantQueryIdentity
          : undefined,
    ),
    queryFn: async () => {
      const session =
        shouldUseParticipantScope || shouldUseParticipantAuth
          ? await ensureParticipantSession()
          : null;
      if (session && shouldUseParticipantScope) {
        return getDivisionScoreboard(
          contestId,
          session.division.division_id,
          session.accessToken,
        );
      }
      if (effectiveDivisionId) {
        return getDivisionScoreboard(
          contestId,
          effectiveDivisionId,
          session?.accessToken ?? generalSession?.accessToken,
        );
      }

      return getScoreboard(
        contestId,
        session?.accessToken ?? generalSession?.accessToken,
      );
    },
    refetchInterval: () => (isDocumentVisible ? pollDelay(5_000) : false),
    refetchIntervalInBackground: false,
  });
  const rows = scoreboardQuery.data?.rows ?? [];
  const problems = problemsQuery.data ?? [];
  const resolvedDivisionName =
    scoreboardQuery.data?.division.name ?? divisionName;
  const release = scoreboardQuery.data?.release;

  return (
    <ContestPageFrame>
      <PageHeading
        eyebrow={contest.title}
        className="gap-4"
        description={
          resolvedDivisionName
            ? `${resolvedDivisionName} 기준 순위입니다.`
            : '유형 없음 유형 기준 순위입니다.'
        }
        title="스코어보드"
        variant="contest"
      />

      <ContestScoreboardTabs contest={contest} contestId={contestId} />

      {shouldShowDivisionSelect ? (
        <DivisionSelect
          divisions={divisions}
          onChange={setPublicDivisionId}
          value={selectedPublicDivisionId}
        />
      ) : null}

      <div className="mt-9">
        {!canViewScoreboard ? (
          <PageNotice
            message={contestResourceAccessMessage(
              contest,
              'scoreboard',
              hasSessionAccess,
            )}
            status="idle"
          />
        ) : null}
        {scoreboardQuery.isLoading && (
          <PageNotice
            message="스코어보드를 불러오는 중입니다."
            status="loading"
          />
        )}
        {scoreboardQuery.isError && (
          <PageNotice
            message="스코어보드를 불러오지 못했습니다."
            status="error"
          />
        )}
        {scoreboardQuery.data?.frozen ? (
          <PageNotice
            message={
              release?.strategy === 'resolver' && release.mode === 'partial'
                ? `프리즈 이후 결과를 공개하고 있습니다. ${release.resolver?.step ?? 0} / ${release.resolver?.total_steps ?? 0}건 공개 · 결과에 따라 순위가 이동합니다.`
                : release?.strategy === 'resolver' && isEnded
                  ? '순위 발표를 기다리고 있습니다. 프리즈 당시 성적을 표시하며, 물음표는 아직 공개하지 않은 제출입니다.'
                  : release?.strategy === 'immediate' &&
                      release.mode === 'partial'
                    ? '전체 공개가 일시 중지되어 프리즈 당시 성적을 표시합니다.'
                    : release?.mode === 'partial'
                      ? `순위를 공개하고 있습니다. ${release.revealed_count} / ${release.total_count}팀 공개`
                      : '현재 공개 스코어보드는 프리즈된 상태입니다.'
            }
            status="ready"
          />
        ) : null}
        {isEnded && release?.mode === 'all' ? (
          <PageNotice
            message={
              release.strategy === 'immediate'
                ? '대회가 종료되어 전체 성적이 공개되었습니다. 남아 있는 채점 결과는 완료되는 대로 반영됩니다.'
                : '모든 순위가 공개되었습니다.'
            }
            status="ready"
          />
        ) : null}

        {canViewScoreboard ? (
          <ContestScoreboardTable
            problems={problems}
            release={release}
            rows={rows}
          />
        ) : null}

        {canViewScoreboard &&
        !scoreboardQuery.isLoading &&
        rows.length === 0 ? (
          <p className="zoj-contest-empty">표시할 스코어보드가 없습니다.</p>
        ) : null}
      </div>
    </ContestPageFrame>
  );
}

export default function ContestScoreboardPage() {
  return (
    <ContestPageShell>
      {({ contest, divisions }) => (
        <ContestScoreboardContent
          contest={contest}
          contestId={contest.contest_id}
          divisions={divisions}
        />
      )}
    </ContestPageShell>
  );
}

function DivisionSelect({
  divisions,
  onChange,
  value,
}: {
  divisions: Division[];
  onChange: (divisionId: string) => void;
  value: string;
}) {
  return (
    <section className="zoj-contest-filter mt-5 grid gap-2">
      <span className="text-sm font-black text-slate-700">유형 선택</span>
      <div className="flex flex-wrap gap-2">
        {divisions.map((division) => (
          <button
            className={[
              'h-9 rounded border px-4 text-sm font-black transition',
              value === division.division_id
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
            ].join(' ')}
            key={division.division_id}
            onClick={() => onChange(division.division_id)}
            type="button"
          >
            {division.name}
          </button>
        ))}
      </div>
    </section>
  );
}
