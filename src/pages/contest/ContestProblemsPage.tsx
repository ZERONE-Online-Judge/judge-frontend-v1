import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageNavigation from '@/components/contest/ContestPageNavigation';
import ContestPageShell from '@/components/contest/ContestPageShell';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
  contestResourceAccessMessage,
} from '@/domains/contestAdministration/logic';
import type { Contest, Division } from '@/domains/contestAdministration/types';
import {
  getContestProblems,
  getDivisionProblems,
} from '@/domains/problemManagement/api';
import {
  problemMemoryLimitLabel,
  problemTimeLimitLabel,
} from '@/domains/problemManagement/resourceLimits';
import PageNotice from '@/shared/ui/PageNotice';

type ProblemStatus = 'success' | 'failed' | 'pending';

function problemStatus(solveStatus?: string | null): ProblemStatus {
  if (solveStatus === 'accepted') return 'success';
  if (solveStatus === 'wrong') return 'failed';

  return 'pending';
}

function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  const labels = {
    success: '성공',
    failed: '실패',
    pending: '미해결',
  };
  const classNames = {
    success: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    pending: 'bg-slate-100 text-slate-500',
  };

  return (
    <span
      className={[
        'inline-flex h-7 items-center rounded px-3 text-xs font-black',
        classNames[status],
      ].join(' ')}
    >
      {labels[status]}
    </span>
  );
}

function ContestProblemsContent({
  contest,
  contestId,
  divisions,
}: {
  contest: Contest;
  contestId: string;
  divisions: Division[];
}) {
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
  } = useContestParticipantSession(contestId);
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const problemAccess = contestResourceAccess(contest, 'problem');
  const phase = isPreview ? 'running' : contestAccessPhase(contest);
  const isEnded = phase === 'ended';
  const isBeforeStart = phase === 'before';
  const [publicDivisionId, setPublicDivisionId] = useState('');
  const selectedPublicDivisionId =
    publicDivisionId || divisions[0]?.division_id || '';
  const shouldUseParticipantScope = hasSessionAccess && !isEnded;
  const shouldUseParticipantAuth =
    isEnded && hasSessionAccess && problemAccess !== 'private';
  const shouldShowDivisionSelect =
    !shouldUseParticipantScope && divisions.length > 1;
  const effectiveDivisionId = shouldUseParticipantScope
    ? activeParticipantSession?.division.division_id
    : selectedPublicDivisionId;
  const generalQueryIdentity = generalSessionQueryIdentity(generalSession);
  const participantQueryIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );
  const canViewProblems =
    isPreview ||
    (canViewContestResource(contest, hasSessionAccess, problemAccess) &&
      !isBeforeStart);

  useEffect(() => {
    if (
      publicDivisionId &&
      !divisions.some((division) => division.division_id === publicDivisionId)
    ) {
      setPublicDivisionId('');
    }
  }, [divisions, publicDivisionId]);

  const problemsQuery = useQuery({
    enabled: canViewProblems,
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

  const problems = problemsQuery.data ?? [];
  const problemDetailSearch =
    !shouldUseParticipantScope && selectedPublicDivisionId
      ? `?divisionId=${encodeURIComponent(selectedPublicDivisionId)}`
      : '';
  return (
    <ContestPageFrame>
      <PageHeading
        eyebrow={contest.title}
        className="gap-4"
        title="문제집"
        variant="contest"
      />

      <ContestPageNavigation contest={contest} contestId={contestId} />

      {shouldShowDivisionSelect ? (
        <DivisionSelect
          divisions={divisions}
          onChange={setPublicDivisionId}
          value={selectedPublicDivisionId}
        />
      ) : null}

      <div className="mt-9">
        {!canViewProblems ? (
          <PageNotice
            message={contestResourceAccessMessage(
              contest,
              'problem',
              hasSessionAccess,
            )}
            status="idle"
          />
        ) : null}
        {problemsQuery.isLoading && (
          <PageNotice
            message="문제 목록을 불러오는 중입니다."
            status="loading"
          />
        )}
        {problemsQuery.isError && (
          <PageNotice
            message="문제 목록을 불러오지 못했습니다."
            status="error"
          />
        )}

        {canViewProblems ? (
          <div className="zoj-problems-surface">
            <table className="zoj-problems-table w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                문제별 제목, 풀이 상태와 실행 제한
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-white text-xs font-black text-slate-950">
                  <th className="w-20 px-4 py-3">문제 번호</th>
                  <th className="px-4 py-3">제목</th>
                  <th className="w-28 px-4 py-3">정보</th>
                  <th className="w-36 px-4 py-3">제한 시간</th>
                  <th className="w-40 px-4 py-3">제한 메모리</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => {
                  return (
                    <tr
                      className="border-b border-slate-200 last:border-b-0 odd:bg-slate-50/80"
                      key={problem.problem_id}
                    >
                      <td
                        data-label="문제"
                        className="px-4 py-4 font-semibold text-indigo-700"
                      >
                        {problem.problem_code}
                      </td>
                      <td
                        data-label="제목"
                        className="min-w-0 px-4 py-4 font-semibold text-slate-900"
                      >
                        <Link
                          className="zoj-problem-title-link hover:text-zoj-blue transition"
                          to={`/contests/${contestId}/problems/${problem.problem_id}${problemDetailSearch}`}
                        >
                          {problem.title}
                        </Link>
                      </td>
                      <td data-label="풀이 상태" className="px-4 py-4">
                        <ProblemStatusBadge
                          status={problemStatus(problem.solve_status)}
                        />
                      </td>
                      <td
                        data-label="시간"
                        className="px-4 py-4 text-slate-600"
                      >
                        {problemTimeLimitLabel(problem)}
                      </td>
                      <td
                        data-label="메모리"
                        className="px-4 py-4 text-slate-600"
                      >
                        {problemMemoryLimitLabel(problem)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {canViewProblems &&
        !problemsQuery.isLoading &&
        problems.length === 0 ? (
          <p className="zoj-contest-empty">표시할 문제가 없습니다.</p>
        ) : null}
      </div>
    </ContestPageFrame>
  );
}

export default function ContestProblemsPage() {
  return (
    <ContestPageShell>
      {({ contest, divisions }) => (
        <ContestProblemsContent
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
