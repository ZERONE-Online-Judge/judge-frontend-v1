import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageNavigation from '@/components/contest/ContestPageNavigation';
import ContestPageShell from '@/components/contest/ContestPageShell';
import ProblemEditorialPanel from '@/components/contest/problem/ProblemEditorialPanel';
import ProblemNavigationPills from '@/components/contest/problem/ProblemNavigationPills';
import ProblemSidebar from '@/components/contest/problem/ProblemSidebar';
import ProblemStatementPanel from '@/components/contest/problem/ProblemStatementPanel';
import ProblemSubmitPanel from '@/components/contest/problem/ProblemSubmitPanel';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
  contestResourceAccessMessage,
} from '@/domains/contestAdministration/logic';
import type { Contest, Division } from '@/domains/contestAdministration/types';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import {
  getContestProblemAssets,
  getContestProblem,
  getContestProblems,
  getDivisionProblems,
} from '@/domains/problemManagement/api';
import {
  createMockSubmission,
  createSubmission,
  getSubmission,
  waitMockSubmissionStatus,
} from '@/domains/submissionScoreboard/api';
import {
  isJudgeLanguage,
  loadLastJudgeLanguage,
  saveLastJudgeLanguage,
} from '@/domains/submissionScoreboard/languagePreference';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';
import type { Submission } from '@/domains/submissionScoreboard/types';
import { formatUserApiError } from '@/shared/api/errors';
import { loadCodeDraft, saveCodeDraft } from '@/shared/lib/codeDraftStorage';
import { formatMemoryKb } from '@/shared/lib/formatters';
import PageNotice from '@/shared/ui/PageNotice';

type ProblemView = 'combined' | 'problem' | 'submit' | 'editorial';
type SubmitFeedbackStatus = 'idle' | 'loading' | 'ready' | 'error';
type SubmitFeedback = {
  message: string;
  status: SubmitFeedbackStatus;
};
type SubmitVariables = {
  draftKey: string;
  language: JudgeLanguage;
  sourceCode: string;
};
type MockResult = Pick<
  Submission,
  | 'status'
  | 'progress_percent'
  | 'runtime_ms'
  | 'memory_kb'
  | 'queue_position'
  | 'submitted_at'
> | null;

const emptySubmitFeedback: SubmitFeedback = { message: '', status: 'idle' };

const judgingStatuses = new Set(['waiting', 'preparing', 'judging']);

const statusLabels: Record<string, string> = {
  waiting: '채점 대기중',
  preparing: '채점 준비중',
  judging: '채점중',
  accepted: '맞았습니다',
  wrong_answer: '틀렸습니다',
  compile_error: '컴파일 에러',
  runtime_error: '런타임 에러',
  time_limit_exceeded: '시간초과',
  memory_limit_exceeded: '메모리 초과',
  output_limit_exceeded: '출력초과',
  system_error: '시스템 오류',
};

function MockJudgeResult({
  result,
}: {
  result: MockResult;
  standalone?: boolean;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!result || !judgingStatuses.has(result.status)) return;

    const updateElapsed = () => {
      const elapsed = Math.floor(
        (Date.now() - new Date(result.submitted_at).getTime()) / 1000,
      );
      setElapsedSeconds(Math.max(0, elapsed));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(interval);
  }, [result?.status, result?.submitted_at]);

  if (!result) return null;
  const hasProgress = typeof result.progress_percent === 'number';
  const progress = hasProgress ? (result.progress_percent ?? 0) : 100;
  const queueText =
    result.status === 'waiting' && typeof result.queue_position === 'number'
      ? `큐 ${result.queue_position}번째`
      : '';
  const done = !judgingStatuses.has(result.status);
  const pendingText =
    queueText ||
    (hasProgress
      ? `${progress}%`
      : `${statusLabels[result.status] ?? result.status} ${elapsedSeconds}초`);
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-slate-950">모의채점 결과</span>
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-black',
            done
              ? result.status === 'accepted'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-700'
              : 'bg-amber-100 text-amber-700',
          ].join(' ')}
        >
          {statusLabels[result.status] ?? result.status}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={[
            'h-full rounded-full bg-amber-400 transition-all duration-500',
            !done && !hasProgress ? 'animate-pulse' : '',
          ].join(' ')}
          style={{
            width: `${Math.max(0, Math.min(100, done || hasProgress ? progress : 35))}%`,
          }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-slate-600">
        <span>{done ? '완료' : pendingText}</span>
        <span>시간 {result.runtime_ms ?? '-'} ms</span>
        <span>메모리 {formatMemoryKb(result.memory_kb)}</span>
      </div>
    </div>
  );
}

function problemViewFromParam(value?: string): ProblemView {
  if (value === 'statement') return 'problem';
  if (value === 'submit') return 'submit';
  if (value === 'editorial') return 'editorial';

  return 'combined';
}

function ContestProblemDetailContent({
  contest,
  contestId,
  divisions,
  problemId,
  view,
}: {
  contest: Contest;
  contestId: string;
  divisions: Division[];
  problemId: string;
  view: ProblemView;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedSubmissionId = searchParams.get('submissionId');
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
  } = useContestParticipantSession(contestId);
  const problemAccess = contestResourceAccess(contest, 'problem');
  const editorialAccess = contestResourceAccess(contest, 'editorial');
  const accessPhase = isPreview ? 'running' : contestAccessPhase(contest);
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const canViewProblem =
    isPreview ||
    canViewContestResource(contest, hasSessionAccess, problemAccess);
  const shouldUseParticipantScope = hasSessionAccess && accessPhase !== 'ended';
  const shouldUseParticipantAuth =
    hasSessionAccess &&
    accessPhase === 'ended' &&
    (problemAccess === 'participants' ||
      (view === 'editorial' && editorialAccess === 'participants'));
  const canViewEditorial =
    accessPhase === 'ended' &&
    problemAccess !== 'private' &&
    canViewContestResource(contest, hasSessionAccess, editorialAccess);
  const canMockJudge =
    accessPhase === 'ended' &&
    Boolean(contest.mock_judging_enabled) &&
    problemAccess !== 'private' &&
    canViewProblem;
  const canShowSubmit = canMockJudge || accessPhase !== 'ended';
  const effectiveView =
    view === 'submit' && !canShowSubmit
      ? 'problem'
      : view === 'editorial' && !canViewEditorial
        ? 'problem'
        : view;
  const generalQueryIdentity = generalSessionQueryIdentity(generalSession);
  const participantQueryIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );
  const [lastJudgeLanguage, setLastJudgeLanguage] = useState<JudgeLanguage>(
    () => loadLastJudgeLanguage(),
  );
  const [draftLanguages, setDraftLanguages] = useState<
    Record<string, JudgeLanguage>
  >({});
  const [draftSourceCodes, setDraftSourceCodes] = useState<
    Record<string, string>
  >({});
  const [submitFeedbackByKey, setSubmitFeedbackByKey] = useState<
    Record<string, SubmitFeedback>
  >({});
  const [mockResultByKey, setMockResultByKey] = useState<
    Record<string, MockResult>
  >({});
  const hydratedSubmissionDraftRef = useRef<string | null>(null);

  const problemQuery = useQuery({
    enabled: canViewProblem && Boolean(problemId),
    queryKey: contestQueryKeys.problemDetail(
      contestId,
      problemId,
      generalQueryIdentity,
      activeParticipantSession?.contestId ??
        participantContest?.contest.contest_id,
      participantQueryIdentity,
    ),
    queryFn: async () => {
      const session =
        shouldUseParticipantScope || shouldUseParticipantAuth
          ? await ensureParticipantSession()
          : null;

      return getContestProblem(
        contestId,
        problemId,
        session?.accessToken ?? generalSession?.accessToken,
      );
    },
  });

  const problem = problemQuery.data;
  const activeProblemId = problem?.problem_id ?? problemId;
  const problemAssetsQuery = useQuery({
    enabled: canViewProblem && Boolean(problemId) && effectiveView !== 'submit',
    queryKey: contestQueryKeys.problemAssets(
      contestId,
      problemId,
      generalQueryIdentity,
      shouldUseParticipantScope
        ? (activeParticipantSession?.contestId ??
            participantContest?.contest.contest_id)
        : undefined,
      shouldUseParticipantScope || shouldUseParticipantAuth
        ? participantQueryIdentity
        : undefined,
    ),
    queryFn: async () => {
      const session =
        shouldUseParticipantScope || shouldUseParticipantAuth
          ? await ensureParticipantSession()
          : null;

      return getContestProblemAssets(
        contestId,
        problemId,
        session?.accessToken ?? generalSession?.accessToken,
      );
    },
  });
  const problemAssets = problemAssetsQuery.data ?? [];
  const selectedDivisionId = shouldUseParticipantScope
    ? (activeParticipantSession?.division.division_id ?? '')
    : (searchParams.get('divisionId') ??
      problem?.division_id ??
      divisions[0]?.division_id ??
      '');
  const showDivisionSelectInSidebar =
    !shouldUseParticipantScope && divisions.length > 1;

  const problemsQuery = useQuery({
    enabled:
      canViewProblem &&
      effectiveView !== 'submit' &&
      (shouldUseParticipantScope || Boolean(selectedDivisionId)),
    queryKey: contestQueryKeys.problems(
      contestId,
      generalQueryIdentity,
      shouldUseParticipantScope
        ? (activeParticipantSession?.contestId ??
            participantContest?.contest.contest_id)
        : undefined,
      selectedDivisionId,
      shouldUseParticipantScope || shouldUseParticipantAuth
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
      if (selectedDivisionId) {
        return getDivisionProblems(
          contestId,
          selectedDivisionId,
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

  function routeForProblem(nextProblemId: string, divisionId: string) {
    const search = divisionId
      ? `?divisionId=${encodeURIComponent(divisionId)}`
      : '';
    if (effectiveView === 'problem') {
      return `/contests/${contestId}/problems/${nextProblemId}/statement${search}`;
    }
    if (effectiveView === 'submit') {
      return `/contests/${contestId}/problems/${nextProblemId}/submit${search}`;
    }
    if (effectiveView === 'editorial') {
      return `/contests/${contestId}/problems/${nextProblemId}/editorial${search}`;
    }
    return `/contests/${contestId}/problems/${nextProblemId}${search}`;
  }

  function handleSidebarDivisionChange(nextDivisionId: string) {
    const currentParams = new URLSearchParams(location.search);
    currentParams.set('divisionId', nextDivisionId);
    currentParams.delete('submissionId');
    const suffix = currentParams.toString();
    navigate(`${location.pathname}${suffix ? `?${suffix}` : ''}`, {
      replace: false,
    });
  }

  useEffect(() => {
    if (
      !showDivisionSelectInSidebar ||
      !selectedDivisionId ||
      problemsQuery.isFetching ||
      problems.length === 0 ||
      problems.some((item) => item.problem_id === activeProblemId)
    ) {
      return;
    }

    navigate(routeForProblem(problems[0].problem_id, selectedDivisionId), {
      replace: true,
    });
  }, [
    activeProblemId,
    navigate,
    problems,
    problemsQuery.isFetching,
    selectedDivisionId,
    showDivisionSelectInSidebar,
  ]);

  const selectedSubmissionQuery = useQuery({
    enabled:
      canViewProblem &&
      effectiveView === 'submit' &&
      Boolean(selectedSubmissionId),
    queryKey: contestQueryKeys.submissionDetail(
      contestId,
      selectedSubmissionId,
      generalQueryIdentity,
      shouldUseParticipantScope
        ? (activeParticipantSession?.contestId ??
            participantContest?.contest.contest_id)
        : undefined,
      shouldUseParticipantScope || shouldUseParticipantAuth
        ? participantQueryIdentity
        : undefined,
    ),
    queryFn: async () => {
      const session = await ensureParticipantSession();
      if (!session?.accessToken) {
        throw new Error('제출 코드를 보려면 대회 참가 로그인이 필요합니다.');
      }

      return getSubmission(
        contestId,
        selectedSubmissionId!,
        session.accessToken,
      );
    },
  });

  const selectedSubmission = selectedSubmissionQuery.data;
  const selectedSubmissionProblemMismatch = Boolean(
    selectedSubmission &&
    problem &&
    selectedSubmission.problem_id !== problem.problem_id,
  );
  const activeDraftKey = selectedSubmissionId
    ? `submission:${selectedSubmissionId}`
    : `problem:${problemId}`;
  const activeDraftScope = `contest:${contestId}`;
  const persistedDraft = selectedSubmissionId
    ? null
    : loadCodeDraft(activeDraftScope, activeDraftKey);
  const fallbackLanguage = isJudgeLanguage(selectedSubmission?.language)
    ? selectedSubmission.language
    : lastJudgeLanguage;
  const preferredLanguage =
    draftLanguages[activeDraftKey] ??
    persistedDraft?.language ??
    fallbackLanguage;
  const allowedLanguages = problem?.allowed_languages;
  const activeLanguage =
    allowedLanguages?.length && !allowedLanguages.includes(preferredLanguage)
      ? allowedLanguages[0]
      : preferredLanguage;
  const activeSourceCode =
    draftSourceCodes[activeDraftKey] ?? persistedDraft?.sourceCode ?? '';
  const submitFeedback =
    submitFeedbackByKey[activeDraftKey] ?? emptySubmitFeedback;
  const mockResult = mockResultByKey[activeDraftKey] ?? null;
  const isViewingSubmissionCode = Boolean(selectedSubmissionId);
  const submitPanelMessage = selectedSubmissionQuery.isError
    ? '선택한 제출 코드를 불러오지 못했습니다.'
    : selectedSubmissionProblemMismatch
      ? '선택한 제출 코드의 문제와 현재 문제 페이지가 일치하지 않습니다.'
      : submitFeedback.message ||
        (isViewingSubmissionCode
          ? '선택한 제출 코드입니다. 수정 후 다시 제출할 수 있습니다.'
          : '');
  const submitPanelMessageStatus: SubmitFeedbackStatus =
    selectedSubmissionQuery.isError
      ? 'error'
      : selectedSubmissionProblemMismatch
        ? 'error'
        : submitFeedback.status !== 'idle'
          ? submitFeedback.status
          : isViewingSubmissionCode
            ? 'ready'
            : 'idle';
  const canSubmitActiveDraft =
    !selectedSubmissionQuery.isError && !selectedSubmissionProblemMismatch;
  const submitPanelTitle = canMockJudge ? '모의채점' : '코드 제출';
  const submitPanelButtonLabel = canMockJudge ? '모의채점 실행' : '제출하기';

  useEffect(() => {
    if (selectedSubmissionId) return;

    const savedDraft = loadCodeDraft(activeDraftScope, activeDraftKey);
    const savedSourceCode = savedDraft?.sourceCode;
    const savedLanguage = savedDraft?.language;
    if (savedSourceCode !== undefined) {
      setDraftSourceCodes((previous) =>
        previous[activeDraftKey] === undefined
          ? { ...previous, [activeDraftKey]: savedSourceCode }
          : previous,
      );
    }
    if (savedLanguage) {
      setDraftLanguages((previous) =>
        previous[activeDraftKey] === undefined
          ? { ...previous, [activeDraftKey]: savedLanguage }
          : previous,
      );
    }
  }, [activeDraftKey, activeDraftScope, selectedSubmissionId]);

  useEffect(() => {
    if (!selectedSubmissionId || !selectedSubmission) return;
    if (typeof selectedSubmission.source_code !== 'string') return;

    const submissionSourceCode = selectedSubmission.source_code;
    const hydrationKey = [
      activeDraftScope,
      activeDraftKey,
      selectedSubmission.submission_id,
      submissionSourceCode,
    ].join(':');
    if (hydratedSubmissionDraftRef.current === hydrationKey) return;
    hydratedSubmissionDraftRef.current = hydrationKey;

    saveCodeDraft(activeDraftScope, activeDraftKey, {
      sourceCode: submissionSourceCode,
    });
    setDraftSourceCodes((previous) => ({
      ...previous,
      [activeDraftKey]: submissionSourceCode,
    }));

    const submissionLanguage = selectedSubmission.language;
    if (isJudgeLanguage(submissionLanguage)) {
      saveCodeDraft(activeDraftScope, activeDraftKey, {
        language: submissionLanguage,
      });
      setDraftLanguages((previous) => ({
        ...previous,
        [activeDraftKey]: submissionLanguage,
      }));
    }
  }, [
    activeDraftKey,
    activeDraftScope,
    selectedSubmission,
    selectedSubmissionId,
  ]);

  function handleLanguageChange(nextLanguage: JudgeLanguage) {
    setLastJudgeLanguage(nextLanguage);
    saveLastJudgeLanguage(nextLanguage);
    saveCodeDraft(activeDraftScope, activeDraftKey, { language: nextLanguage });
    setDraftLanguages((previous) => ({
      ...previous,
      [activeDraftKey]: nextLanguage,
    }));
  }

  function handleSourceCodeChange(nextSourceCode: string) {
    saveCodeDraft(activeDraftScope, activeDraftKey, {
      sourceCode: nextSourceCode,
    });
    setDraftSourceCodes((previous) => ({
      ...previous,
      [activeDraftKey]: nextSourceCode,
    }));
  }

  function setSubmitFeedback(draftKey: string, feedback: SubmitFeedback) {
    setSubmitFeedbackByKey((previous) => ({
      ...previous,
      [draftKey]: feedback,
    }));
  }

  const submitMutation = useMutation({
    mutationFn: async ({ language, sourceCode }: SubmitVariables) => {
      if (!problem) throw new Error('문제 정보를 불러오는 중입니다.');
      if (
        selectedSubmission &&
        selectedSubmission.problem_id !== problem.problem_id
      ) {
        throw new Error(
          '선택한 제출 코드의 문제와 현재 문제 페이지가 일치하지 않습니다.',
        );
      }

      const session = shouldUseParticipantScope
        ? await ensureParticipantSession()
        : null;
      const token = session?.accessToken;

      if (!token) {
        throw new Error('제출하려면 대회 참가 로그인이 필요합니다.');
      }

      return createSubmission(contestId, problem.problem_id, token, {
        language,
        source_code: sourceCode,
      });
    },
    onMutate: ({ draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: '제출을 전송하고 있습니다.',
        status: 'loading',
      });
    },
    onSuccess: (submission, { draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: '제출이 접수되었습니다.',
        status: 'ready',
      });
      void queryClient.invalidateQueries({
        queryKey: ['contest-submissions', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['contest-scoreboard', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['contest-problems', contestId],
      });
      navigate(
        `/contests/${contestId}/submissions?problemId=${encodeURIComponent(submission.problem_id)}`,
      );
    },
    onError: (error, { draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: formatUserApiError(error, '제출을 처리하지 못했습니다.'),
        status: 'error',
      });
    },
  });

  const mockSubmitMutation = useMutation({
    mutationFn: async ({ draftKey, language, sourceCode }: SubmitVariables) => {
      if (!problem) throw new Error('문제 정보를 불러오는 중입니다.');
      let token = generalSession?.accessToken;
      if (problemAccess === 'participants') {
        const session = await ensureParticipantSession();
        if (!session) {
          throw new Error('모의채점하려면 대회 참가 로그인이 필요합니다.');
        }
        token = session.accessToken;
      }
      const created = await createMockSubmission(
        contestId,
        problem.problem_id,
        token,
        { language, source_code: sourceCode },
      );
      setMockResultByKey((previous) => ({ ...previous, [draftKey]: created }));
      let latest = created;
      for (let index = 0; index < 60; index += 1) {
        if (!judgingStatuses.has(latest.status)) {
          return latest;
        }
        latest = await waitMockSubmissionStatus(
          contestId,
          created.submission_id,
          token,
          { waitSeconds: 1, pollIntervalSeconds: 0.15 },
        );
        setMockResultByKey((previous) => ({
          ...previous,
          [draftKey]: latest,
        }));
      }
      return latest;
    },
    onMutate: ({ draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: '모의채점을 실행하고 있습니다.',
        status: 'loading',
      });
      setMockResultByKey((previous) => ({ ...previous, [draftKey]: null }));
    },
    onSuccess: (submission, { draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: '모의채점이 완료되었습니다.',
        status: 'ready',
      });
      setMockResultByKey((previous) => ({
        ...previous,
        [draftKey]: submission,
      }));
    },
    onError: (error, { draftKey }: SubmitVariables) => {
      setSubmitFeedback(draftKey, {
        message: formatUserApiError(error, '모의채점을 처리하지 못했습니다.'),
        status: 'error',
      });
    },
  });

  function submitActiveDraft() {
    if (!canSubmitActiveDraft) {
      setSubmitFeedback(activeDraftKey, {
        message: submitPanelMessage || '현재 상태에서는 제출할 수 없습니다.',
        status: 'error',
      });
      return;
    }

    const variables = {
      draftKey: activeDraftKey,
      language: activeLanguage,
      sourceCode: activeSourceCode,
    };
    if (canMockJudge) {
      mockSubmitMutation.mutate(variables);
      return;
    }
    submitMutation.mutate(variables);
  }

  return (
    <ContestPageFrame>
      <PageHeading
        eyebrow={contest.title}
        className="gap-4"
        title="문제집"
        variant="contest"
      />

      <ContestPageNavigation contest={contest} contestId={contestId} />

      <section className="zoj-problem-view-toolbar">
        <ProblemNavigationPills
          active={effectiveView}
          allowEditorial={canViewEditorial}
          allowSubmit={canShowSubmit}
          contestId={contestId}
          problemId={problemId}
          search={location.search}
        />
      </section>

      {problemQuery.isLoading ||
      problemsQuery.isLoading ||
      selectedSubmissionQuery.isLoading ||
      (effectiveView === 'editorial' && problemAssetsQuery.isLoading) ? (
        <PageNotice message="문제를 불러오는 중입니다." status="loading" />
      ) : null}
      {!canViewProblem ? (
        <PageNotice
          message={contestResourceAccessMessage(
            contest,
            'problem',
            hasSessionAccess,
          )}
          status="idle"
        />
      ) : null}
      {problemQuery.isError ||
      problemsQuery.isError ||
      selectedSubmissionQuery.isError ||
      problemAssetsQuery.isError ? (
        <PageNotice message="문제를 불러오지 못했습니다." status="error" />
      ) : null}

      {problem && effectiveView === 'combined' && canShowSubmit ? (
        <section className="zoj-problem-workspace is-combined">
          <ProblemSidebar
            activeProblemId={activeProblemId}
            contestId={contestId}
            divisions={divisions}
            onDivisionChange={
              showDivisionSelectInSidebar
                ? handleSidebarDivisionChange
                : undefined
            }
            problems={problems}
            selectedDivisionId={selectedDivisionId}
            search={location.search}
          />
          <ProblemStatementPanel assets={problemAssets} problem={problem} />
          <ProblemSubmitPanel
            allowedLanguages={problem.allowed_languages}
            isSubmitting={
              submitMutation.isPending || mockSubmitMutation.isPending
            }
            language={activeLanguage}
            message={submitFeedback.message}
            messageStatus={submitFeedback.status}
            onLanguageChange={handleLanguageChange}
            onSourceCodeChange={handleSourceCodeChange}
            onSubmit={submitActiveDraft}
            problemCode={problem.problem_code}
            problemTitle={problem.title}
            sourceCode={activeSourceCode}
            submitLabel={submitPanelButtonLabel}
            submittingLabel={canMockJudge ? '채점 중' : '제출 중'}
            title={submitPanelTitle}
            footer={<MockJudgeResult result={mockResult} />}
          />
        </section>
      ) : null}

      {problem &&
      (effectiveView === 'problem' ||
        (effectiveView === 'combined' && !canShowSubmit)) ? (
        <section className="zoj-problem-workspace">
          <ProblemSidebar
            activeProblemId={activeProblemId}
            contestId={contestId}
            divisions={divisions}
            onDivisionChange={
              showDivisionSelectInSidebar
                ? handleSidebarDivisionChange
                : undefined
            }
            problems={problems}
            selectedDivisionId={selectedDivisionId}
            targetView="problem"
            search={location.search}
          />
          <ProblemStatementPanel assets={problemAssets} problem={problem} />
        </section>
      ) : null}

      {problem && effectiveView === 'editorial' && canViewEditorial ? (
        <section className="zoj-problem-workspace">
          <ProblemSidebar
            activeProblemId={activeProblemId}
            contestId={contestId}
            divisions={divisions}
            onDivisionChange={
              showDivisionSelectInSidebar
                ? handleSidebarDivisionChange
                : undefined
            }
            problems={problems}
            selectedDivisionId={selectedDivisionId}
            targetView="editorial"
            search={location.search}
          />
          <ProblemEditorialPanel assets={problemAssets} problem={problem} />
        </section>
      ) : null}

      {problem && effectiveView === 'submit' && canShowSubmit ? (
        <section className="zoj-problem-workspace is-submit-only">
          <ProblemSubmitPanel
            allowedLanguages={problem.allowed_languages}
            canSubmit={canSubmitActiveDraft}
            editorHeight="clamp(280px, 55dvh, 640px)"
            isSubmitting={
              submitMutation.isPending || mockSubmitMutation.isPending
            }
            language={activeLanguage}
            layout="standalone"
            message={submitPanelMessage}
            messageStatus={submitPanelMessageStatus}
            onLanguageChange={handleLanguageChange}
            onSourceCodeChange={handleSourceCodeChange}
            onSubmit={submitActiveDraft}
            problemCode={problem.problem_code}
            problemTitle={problem.title}
            sourceCode={activeSourceCode}
            submitLabel={submitPanelButtonLabel}
            submittingLabel={canMockJudge ? '채점 중' : '제출 중'}
            title={submitPanelTitle}
            footer={<MockJudgeResult result={mockResult} />}
          />
        </section>
      ) : null}
    </ContestPageFrame>
  );
}

export default function ContestProblemDetailPage() {
  const { problemId = '', problemView } = useParams();
  const view = problemViewFromParam(problemView);

  return (
    <ContestPageShell>
      {({ contest, divisions }) => (
        <ContestProblemDetailContent
          contest={contest}
          contestId={contest.contest_id}
          divisions={divisions}
          problemId={problemId}
          view={view}
        />
      )}
    </ContestPageShell>
  );
}
