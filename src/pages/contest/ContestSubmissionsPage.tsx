import Select from '@/shared/ui/Select';
import { pollDelay } from '@/shared/query/polling';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageShell from '@/components/contest/ContestPageShell';
import ContestSubmissionsTable from '@/components/contest/submissions/ContestSubmissionsTable';
import ContestSubmissionsTabs from '@/components/contest/submissions/ContestSubmissionsTabs';
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
import { listSubmissionsPage } from '@/domains/submissionScoreboard/api';
import { getSubmission } from '@/domains/submissionScoreboard/api';
import { isSubmissionPending } from '@/domains/submissionScoreboard/status';
import type { Submission } from '@/domains/submissionScoreboard/types';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import PageNotice from '@/shared/ui/PageNotice';

const SUBMISSIONS_PAGE_SIZE = 20;

function ContestSubmissionsContent({
  contest,
  contestId,
  divisions,
}: {
  contest: Contest;
  contestId: string;
  divisions: Division[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isDocumentVisible = useDocumentVisibility();
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
  } = useContestParticipantSession(contestId);
  const fallbackTeamName =
    participantContest?.team.team_name ??
    activeParticipantSession?.team.team_name;
  const fallbackMemberName =
    participantContest?.member.name ?? activeParticipantSession?.member.name;
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const submissionAccess = contestResourceAccess(contest, 'submission');
  const problemAccess = contestResourceAccess(contest, 'problem');
  const phase = isPreview ? 'running' : contestAccessPhase(contest);
  const isEnded = phase === 'ended';
  const isBeforeStart = phase === 'before';
  const [publicDivisionId, setPublicDivisionId] = useState('');
  const selectedProblemId = searchParams.get('problemId') ?? '';
  const selectedPublicDivisionId = divisions.some(
    (division) => division.division_id === publicDivisionId,
  )
    ? publicDivisionId
    : (divisions[0]?.division_id ?? '');
  const [pagination, setPagination] = useState<{
    filter: string;
    cursors: string[];
  }>({ filter: '', cursors: [] });
  const shouldUseParticipantScope = hasSessionAccess && !isEnded;
  const shouldUseParticipantAuth =
    isEnded &&
    hasSessionAccess &&
    (submissionAccess === 'participants' || problemAccess === 'participants');
  const shouldShowDivisionSelect =
    !shouldUseParticipantScope && divisions.length > 1;
  const effectiveDivisionId = shouldUseParticipantScope
    ? activeParticipantSession?.division.division_id
    : selectedPublicDivisionId;
  const canViewSubmissions =
    isPreview ||
    (canViewContestResource(contest, hasSessionAccess, submissionAccess) &&
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

  const filter = `${contestId}:${effectiveDivisionId ?? ''}:${selectedProblemId}:${participantQueryIdentity ?? generalQueryIdentity}`;
  const cursorStack = pagination.filter === filter ? pagination.cursors : [];
  const currentCursor = cursorStack.at(-1);
  function setCursorStack(next: string[] | ((previous: string[]) => string[])) {
    setPagination((previous) => ({
      filter,
      cursors:
        typeof next === 'function'
          ? next(previous.filter === filter ? previous.cursors : [])
          : next,
    }));
  }

  const problemsQuery = useQuery({
    enabled: canViewSubmissions && canViewProblems,
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
    placeholderData: keepPreviousData,
  });

  const submissionsQuery = useQuery({
    enabled: canViewSubmissions,
    queryKey: contestQueryKeys.submissions(
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
      currentCursor ?? undefined,
      selectedProblemId || undefined,
      shouldUseParticipantScope,
    ),
    queryFn: async () => {
      const session =
        shouldUseParticipantScope || shouldUseParticipantAuth
          ? await ensureParticipantSession()
          : null;
      if (session && shouldUseParticipantScope) {
        return listSubmissionsPage(contestId, session.accessToken, {
          cursor: currentCursor,
          includeSource: false,
          limit: SUBMISSIONS_PAGE_SIZE,
          problemId: selectedProblemId || undefined,
        });
      }

      return listSubmissionsPage(
        contestId,
        session?.accessToken ?? generalSession?.accessToken,
        {
          cursor: currentCursor,
          divisionId: effectiveDivisionId,
          limit: SUBMISSIONS_PAGE_SIZE,
          problemId: selectedProblemId || undefined,
        },
      );
    },
    refetchInterval: (query) => {
      if (!isDocumentVisible) return false;

      const submissions = (query.state.data?.data ?? []) as Submission[];
      const hasPendingSubmission =
        !query.state.data ||
        submissions.some((submission) =>
          isSubmissionPending(submission.status),
        );

      return pollDelay(hasPendingSubmission ? 3_000 : 15_000);
    },
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
  const submissions = submissionsQuery.data?.data ?? [];
  const page = submissionsQuery.data?.page;
  const problems = problemsQuery.data ?? [];
  const availableProblems = effectiveDivisionId
    ? problems.filter((problem) => problem.division_id === effectiveDivisionId)
    : problems;

  return (
    <ContestPageFrame>
      <PageHeading
        eyebrow={contest.title}
        className="gap-4"
        description="대회 중에는 로그인한 참가팀의 제출만 확인합니다."
        title="채점현황"
        variant="contest"
      />

      <ContestSubmissionsTabs contest={contest} contestId={contestId} />

      {shouldShowDivisionSelect ? (
        <DivisionSelect
          divisions={divisions}
          onChange={(divisionId) => {
            setPublicDivisionId(divisionId);
            setCursorStack([]);
            const next = new URLSearchParams(searchParams);
            next.delete('problemId');
            setSearchParams(next, { replace: true });
          }}
          value={selectedPublicDivisionId}
        />
      ) : null}

      {canViewSubmissions ? (
        <ProblemFilterSelect
          onChange={(problemId) => {
            setCursorStack([]);
            const next = new URLSearchParams(searchParams);
            if (problemId) next.set('problemId', problemId);
            else next.delete('problemId');
            setSearchParams(next, { replace: true });
          }}
          problems={availableProblems}
          value={selectedProblemId}
        />
      ) : null}

      <div className="mt-9">
        {!canViewSubmissions ? (
          <PageNotice
            message={contestResourceAccessMessage(
              contest,
              'submission',
              hasSessionAccess,
            )}
            status="idle"
          />
        ) : null}
        {submissionsQuery.isLoading && (
          <PageNotice
            message="제출 현황을 불러오는 중입니다."
            status="loading"
          />
        )}
        {submissionsQuery.isError && (
          <PageNotice
            message="제출 현황을 불러오지 못했습니다."
            status="error"
          />
        )}

        {canViewSubmissions ? (
          <ContestSubmissionsTable
            contestId={contestId}
            fallbackMemberName={fallbackMemberName}
            fallbackTeamName={fallbackTeamName}
            problems={problems}
            submissions={submissions}
            sourceScopeKey={participantQueryIdentity}
            loadSource={
              shouldUseParticipantScope
                ? async (submissionId) => {
                    const session = await ensureParticipantSession();
                    if (!session) throw new Error('로그인이 필요합니다.');
                    const submission = await getSubmission(
                      contestId,
                      submissionId,
                      session.accessToken,
                    );
                    return submission.source_code ?? '';
                  }
                : undefined
            }
          />
        ) : null}

        {canViewSubmissions ? (
          <PaginationControls
            currentCount={submissions.length}
            currentCursor={page?.current_cursor ?? currentCursor ?? null}
            hasNext={Boolean(page?.next_cursor)}
            hasPrevious={cursorStack.length > 0}
            isFetching={submissionsQuery.isFetching}
            onNext={() => {
              if (page?.next_cursor) {
                setCursorStack((prev) => [...prev, page.next_cursor!]);
              }
            }}
            onPrevious={() => setCursorStack((prev) => prev.slice(0, -1))}
            pageSize={SUBMISSIONS_PAGE_SIZE}
            totalCount={page?.total_count ?? null}
          />
        ) : null}

        {canViewSubmissions &&
        !submissionsQuery.isLoading &&
        submissions.length === 0 ? (
          <p className="zoj-contest-empty">표시할 제출이 없습니다.</p>
        ) : null}
      </div>
    </ContestPageFrame>
  );
}

function PaginationControls({
  currentCount,
  currentCursor,
  hasNext,
  hasPrevious,
  isFetching,
  onNext,
  onPrevious,
  pageSize,
  totalCount,
}: {
  currentCount: number;
  currentCursor: string | null;
  hasNext: boolean;
  hasPrevious: boolean;
  isFetching: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pageSize: number;
  totalCount: number | null;
}) {
  const start = currentCount
    ? Number(currentCursor ?? 0) + 1
    : Number(currentCursor ?? 0);
  const end = Number(currentCursor ?? 0) + currentCount;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600">
      <span>
        {totalCount === null
          ? `${start}-${end}`
          : `${start}-${end} / ${totalCount.toLocaleString('ko-KR')}`}
        {isFetching ? ' · 갱신 중' : ''}
      </span>
      <div className="flex gap-2">
        <button
          className="h-9 rounded border border-slate-200 px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
          disabled={!hasPrevious || isFetching}
          onClick={onPrevious}
          type="button"
        >
          이전
        </button>
        <button
          className="h-9 rounded border border-slate-200 px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
          disabled={!hasNext || isFetching || currentCount < pageSize}
          onClick={onNext}
          type="button"
        >
          다음
        </button>
      </div>
    </div>
  );
}

function ProblemFilterSelect({
  onChange,
  problems,
  value,
}: {
  onChange: (problemId: string) => void;
  problems: { problem_id: string; problem_code: string; title: string }[];
  value: string;
}) {
  return (
    <section className="zoj-contest-filter mt-5 grid gap-2">
      <span className="text-sm font-black text-slate-700">문제 선택</span>
      <Select
        className="h-10 w-full max-w-md rounded border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">전체</option>
        {problems.map((problem) => (
          <option key={problem.problem_id} value={problem.problem_id}>
            {problem.problem_code}. {problem.title}
          </option>
        ))}
      </Select>
    </section>
  );
}

export default function ContestSubmissionsPage() {
  return (
    <ContestPageShell>
      {({ contest, divisions }) => (
        <ContestSubmissionsContent
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
