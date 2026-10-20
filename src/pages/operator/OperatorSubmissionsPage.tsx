import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import ModalDialog from '@/shared/ui/ModalDialog';
import SubmissionDetailContent from '@/components/operator/SubmissionDetailContent';
import RejudgingPanel from '@/components/operator/RejudgingPanel';
import {
  canRejudgeSubmission,
  type RejudgingTarget,
} from '@/domains/submissionScoreboard/rejudging';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import ProblemStatementPanel from '@/components/contest/problem/ProblemStatementPanel';
import { sharedUiText } from '@/data/uiText';
import {
  JudgeIcon,
  OperatorAccessGate,
  OperatorMetricCard,
  OperatorPanel,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { contestStaffDisplayName } from '@/domains/identityAccess/staffDisplay';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import { getOperatorProblems } from '@/domains/problemManagement/api';
import type { Problem } from '@/domains/problemManagement/types';
import { listParticipantTeams } from '@/domains/teamParticipation/api';
import type { ParticipantTeam } from '@/domains/teamParticipation/types';
import {
  getOperatorSubmission,
  rejudgeSystemError,
  getOperatorSubmissionFilters,
  listOperatorSubmissionsPage,
  waitOperatorSubmissionStatus,
} from '@/domains/submissionScoreboard/api';
import type {
  Submission,
  SubmissionKindFilter,
} from '@/domains/submissionScoreboard/types';
import {
  isSubmissionPending,
  submissionProgressText,
} from '@/domains/submissionScoreboard/status';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/dateTime';
import { formatMemoryKb } from '@/shared/lib/formatters';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import AnimatedNumber from '@/shared/ui/AnimatedNumber';
import SubmissionStatusBadge from '@/shared/ui/SubmissionStatusBadge';

const SUBMISSIONS_PAGE_SIZE = 20;
const SUBMISSION_KIND_OPTIONS: {
  value: SubmissionKindFilter;
  label: string;
}[] = [
  { value: 'all', label: '전체' },
  { value: 'participant', label: '참가자 제출' },
  { value: 'operator_test', label: '검수·테스트 제출' },
  { value: 'participant_preview', label: '참가자 미리보기' },
  { value: 'mock_judging', label: '모의채점' },
];
type SubmissionProblem = Pick<
  Problem,
  'problem_id' | 'problem_code' | 'title'
> &
  Partial<Problem>;

function operatorSubmissionDivisionStorageKey(contestId: string) {
  return `zoj.operator.submissions.division.${contestId}`;
}

function operatorSubmissionProblemStorageKey(contestId: string) {
  return `zoj.operator.submissions.problem.${contestId}`;
}

function operatorSubmissionTeamStorageKey(contestId: string) {
  return `zoj.operator.submissions.team.${contestId}`;
}

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; the in-memory selection still works.
  }
}

export default function OperatorSubmissionsPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.submission.view"
    >
      {(session) =>
        contestId ? (
          <OperatorSubmissionsContent
            contestId={contestId}
            token={session.accessToken}
            canRejudge={hasContestPermission(
              session,
              contestId,
              'contest.problem.test',
            )}
            canViewProblems={hasContestPermission(
              session,
              contestId,
              'contest.problem.view',
            )}
            canViewParticipants={hasContestPermission(
              session,
              contestId,
              'contest.participant.view',
            )}
          />
        ) : (
          <PageLayout
            variant="management"
            title={sharedUiText.contestSelectionRequiredTitle}
          >
            {sharedUiText.contestSelectionRequiredBody}
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorSubmissionsContent({
  contestId,
  token,
  canViewProblems,
  canViewParticipants,
  canRejudge,
}: {
  contestId: string;
  token: string;
  canRejudge: boolean;
  canViewProblems: boolean;
  canViewParticipants: boolean;
}) {
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const waitingIds = useRef(new Set<string>());
  const divisionStorageKey = operatorSubmissionDivisionStorageKey(contestId);
  const problemStorageKey = operatorSubmissionProblemStorageKey(contestId);
  const teamStorageKey = operatorSubmissionTeamStorageKey(contestId);
  const kindStorageKey = `zoj.operator.submissions.kind.${contestId}`;
  const [submissionKind, setSubmissionKind] = useState<SubmissionKindFilter>(
    () => {
      const saved = readStoredValue(kindStorageKey);
      return (
        SUBMISSION_KIND_OPTIONS.find((option) => option.value === saved)
          ?.value ?? 'all'
      );
    },
  );
  const [divisionId, setDivisionId] = useState(() =>
    readStoredValue(divisionStorageKey),
  );
  const [problemId, setProblemId] = useState(() =>
    readStoredValue(problemStorageKey),
  );
  const [teamId, setTeamId] = useState(() => readStoredValue(teamStorageKey));
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const currentCursor = cursorStack.at(-1);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [rejudgingTarget, setRejudgingTarget] =
    useState<RejudgingTarget | null>(null);
  const [selectedProblemPreviewId, setSelectedProblemPreviewId] = useState('');
  const [selectedOwnerSubmissionId, setSelectedOwnerSubmissionId] =
    useState('');

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const problemsQuery = useQuery({
    enabled: canViewProblems,
    queryKey: ['operator', 'problems', contestId, queryIdentity],
    queryFn: () => getOperatorProblems(contestId, token),
  });
  const filtersQuery = useQuery({
    queryKey: ['operator', 'submission-filters', contestId, queryIdentity],
    queryFn: () => getOperatorSubmissionFilters(contestId, token),
  });
  const submissionsQuery = useQuery({
    queryKey: [
      'operator',
      'submissions',
      contestId,
      submissionKind,
      divisionId,
      problemId || null,
      teamId || null,
      currentCursor ?? null,
      queryIdentity,
    ],
    queryFn: () =>
      listOperatorSubmissionsPage(contestId, token, {
        cursor: currentCursor,
        divisionId: divisionId || undefined,
        limit: SUBMISSIONS_PAGE_SIZE,
        problemId: problemId || undefined,
        teamId: teamId || undefined,
        submissionKind: submissionKind === 'all' ? undefined : submissionKind,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (!isVisible) return false;
      const submissions = query.state.data?.data ?? [];
      return submissions.some((submission) =>
        isSubmissionPending(submission.status),
      )
        ? 3_000
        : 15_000;
    },
    refetchIntervalInBackground: false,
  });
  const teamsQuery = useQuery({
    enabled: canViewParticipants,
    queryKey: ['operator', 'participants', contestId, queryIdentity],
    queryFn: () => listParticipantTeams(contestId, token),
    placeholderData: keepPreviousData,
  });

  const retryMutation = useMutation({
    mutationFn: (submissionId: string) =>
      rejudgeSystemError(contestId, submissionId, token),
    onSuccess: (updated) => {
      queryClient.setQueryData<Submission>(
        [
          'operator',
          'submission-detail',
          contestId,
          updated.submission_id,
          queryIdentity,
        ],
        (old) => ({ ...old, ...updated }),
      );
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'submissions', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
    },
  });
  const retry = (submissionId: string) => {
    if (!retryMutation.isPending) retryMutation.mutate(submissionId);
  };
  const divisions = dashboardQuery.data?.divisions ?? [];
  const problems = filtersQuery.data?.problems ?? [];
  const filteredProblems = divisionId
    ? problems.filter((problem) => problem.division_id === divisionId)
    : problems;
  const filteredTeams = useMemo(
    () =>
      divisionId
        ? (filtersQuery.data?.teams ?? []).filter(
            (team) => team.division_id === divisionId,
          )
        : (filtersQuery.data?.teams ?? []),
    [divisionId, filtersQuery.data?.teams],
  );

  useEffect(() => {
    if (!divisions.length) return;
    if (
      divisionId &&
      !divisions.some((division) => division.division_id === divisionId)
    ) {
      const nextDivisionId = '';
      setDivisionId(nextDivisionId);
      writeStoredValue(divisionStorageKey, nextDivisionId);
      setCursorStack([]);
    }
  }, [divisionId, divisionStorageKey, divisions]);

  useEffect(() => {
    if (
      problemId &&
      !filteredProblems.some((problem) => problem.problem_id === problemId)
    ) {
      setProblemId('');
      writeStoredValue(problemStorageKey, '');
      setCursorStack([]);
    }
  }, [filteredProblems, problemId, problemStorageKey]);

  useEffect(() => {
    if (
      teamId &&
      !filteredTeams.some((team) => team.participant_team_id === teamId)
    ) {
      setTeamId('');
      writeStoredValue(teamStorageKey, '');
      setCursorStack([]);
    }
  }, [filteredTeams, teamId, teamStorageKey]);

  useEffect(() => {
    if (!isVisible) return;

    (submissionsQuery.data?.data ?? [])
      .filter((submission) => isSubmissionPending(submission.status))
      .forEach((submission) => {
        if (waitingIds.current.has(submission.submission_id)) return;

        waitingIds.current.add(submission.submission_id);
        void waitOperatorSubmissionStatus(
          contestId,
          submission.submission_id,
          token,
          {
            pollIntervalSeconds: 0.5,
            waitSeconds: 4,
          },
        )
          .then(() => {
            void queryClient.invalidateQueries({
              queryKey: ['operator', 'submissions', contestId],
            });
            void queryClient.invalidateQueries({
              queryKey: ['operator', 'dashboard', contestId],
            });
          })
          .catch(() => undefined)
          .finally(() => {
            waitingIds.current.delete(submission.submission_id);
          });
      });
  }, [contestId, isVisible, queryClient, submissionsQuery.data, token]);

  const submissions = submissionsQuery.data?.data ?? [];
  const page = submissionsQuery.data?.page;
  const pendingCount = submissions.filter((submission) =>
    isSubmissionPending(submission.status),
  ).length;
  const problemById = useMemo(
    () =>
      new Map<string, SubmissionProblem>(
        [
          ...(filtersQuery.data?.problems ?? []),
          ...(canViewProblems ? (problemsQuery.data ?? []) : []),
        ].map((problem) => [problem.problem_id, problem]),
      ),
    [filtersQuery.data?.problems, canViewProblems, problemsQuery.data],
  );
  const teamById = useMemo(
    () =>
      new Map(
        (canViewParticipants ? (teamsQuery.data ?? []) : []).map((team) => [
          team.participant_team_id,
          team,
        ]),
      ),
    [canViewParticipants, teamsQuery.data],
  );
  const selectedProblemPreview =
    selectedProblemPreviewId && canViewProblems
      ? (problemsQuery.data?.find(
          (problem) => problem.problem_id === selectedProblemPreviewId,
        ) ?? null)
      : null;
  const selectedOwnerSubmission = selectedOwnerSubmissionId
    ? (submissions.find(
        (submission) => submission.submission_id === selectedOwnerSubmissionId,
      ) ?? null)
    : null;
  const selectedSubmissionQuery = useQuery({
    enabled: Boolean(selectedSubmissionId),
    queryKey: [
      'operator',
      'submission-detail',
      contestId,
      selectedSubmissionId,
      queryIdentity,
    ],
    queryFn: () =>
      getOperatorSubmission(contestId, selectedSubmissionId, token),
    refetchInterval: (query) =>
      isVisible && isSubmissionPending(query.state.data?.status)
        ? 3_000
        : false,
    refetchIntervalInBackground: false,
  });

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      description="대회 전체 제출과 채점 진행 상태를 운영자 기준으로 확인합니다."
      eyebrow="Operator"
      title="제출 목록"
      width="full"
    >
      {retryMutation.isError ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
        >
          {formatApiError(retryMutation.error, '재채점을 요청하지 못했습니다.')}
        </p>
      ) : null}
      {retryMutation.isSuccess ? (
        <p
          role="status"
          className="mb-4 rounded-lg bg-indigo-50 p-4 text-sm text-indigo-700"
        >
          재채점을 요청했습니다. 원래 제출 시각과 코드를 유지하고 실제 채점
          결과를 반영합니다.
        </p>
      ) : null}

      {dashboardQuery.error ||
      filtersQuery.error ||
      problemsQuery.error ||
      submissionsQuery.error ||
      teamsQuery.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {formatApiError(
            dashboardQuery.error ||
              filtersQuery.error ||
              problemsQuery.error ||
              submissionsQuery.error ||
              teamsQuery.error,
            '제출 데이터를 불러오지 못했습니다',
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <OperatorMetricCard
          description="현재 목록 기준"
          icon={<JudgeIcon />}
          label="전체 제출"
          tone="indigo"
          value={<AnimatedNumber value={submissions.length} />}
        />
        <OperatorMetricCard
          description="채점 중 또는 대기"
          icon={<JudgeIcon />}
          label="진행 중"
          tone="amber"
          value={<AnimatedNumber value={pendingCount} />}
        />
        <OperatorMetricCard
          description="대시보드 집계"
          icon={<JudgeIcon />}
          label="대기 작업"
          tone="cyan"
          value={
            <AnimatedNumber value={dashboardQuery.data?.pending_jobs ?? 0} />
          }
        />
      </div>

      <OperatorPanel
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="h-10 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              onClick={() => {
                setSubmissionKind('all');
                writeStoredValue(kindStorageKey, 'all');
                setDivisionId('');
                setProblemId('');
                setTeamId('');
                setCursorStack([]);
                writeStoredValue(divisionStorageKey, '');
                writeStoredValue(problemStorageKey, '');
                writeStoredValue(teamStorageKey, '');
              }}
            >
              전체 제출 보기
            </button>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              유형
              <select
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => {
                  const nextDivisionId = event.target.value;
                  setDivisionId(nextDivisionId);
                  setProblemId('');
                  setTeamId('');
                  writeStoredValue(divisionStorageKey, nextDivisionId);
                  writeStoredValue(problemStorageKey, '');
                  writeStoredValue(teamStorageKey, '');
                  setCursorStack([]);
                }}
                value={divisionId}
              >
                <option value="">전체 유형</option>
                {divisions.map((division) => (
                  <option
                    key={division.division_id}
                    value={division.division_id}
                  >
                    {division.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              문제
              <select
                className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => {
                  const nextProblemId = event.target.value;
                  setProblemId(nextProblemId);
                  writeStoredValue(problemStorageKey, nextProblemId);
                  setCursorStack([]);
                }}
                value={problemId}
              >
                <option value="">전체</option>
                {filteredProblems.map((problem) => (
                  <option key={problem.problem_id} value={problem.problem_id}>
                    {problem.problem_code}. {problem.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              팀
              <select
                className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => {
                  const nextTeamId = event.target.value;
                  setTeamId(nextTeamId);
                  writeStoredValue(teamStorageKey, nextTeamId);
                  setCursorStack([]);
                }}
                value={teamId}
              >
                <option value="">전체</option>
                {filteredTeams.map((team) => (
                  <option
                    key={team.participant_team_id}
                    value={team.participant_team_id}
                  >
                    {team.team_name}
                  </option>
                ))}
              </select>
            </label>
            {canRejudge ? (
              <button
                type="button"
                disabled={!problemId}
                className="h-10 rounded-lg border border-indigo-200 px-3 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                title={
                  problemId
                    ? '선택한 문제와 팀의 완료된 참가자 제출을 재채점합니다'
                    : '문제를 먼저 선택하세요'
                }
                onClick={() =>
                  setRejudgingTarget({
                    problem_id: problemId,
                    ...(teamId ? { team_id: teamId } : {}),
                  })
                }
              >
                선택 범위 재채점
              </button>
            ) : null}
          </div>
        }
        description="제출 구분을 선택해 참가자, 검수·테스트, 미리보기, 모의채점을 나눠 확인합니다. 유형·문제·팀 필터와 함께 적용됩니다."
        title="제출 목록"
      >
        <div
          role="group"
          aria-label="제출 구분"
          className="flex flex-wrap gap-2"
        >
          {SUBMISSION_KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={submissionKind === option.value}
              className={[
                'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                submissionKind === option.value
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50',
              ].join(' ')}
              onClick={() => {
                setSubmissionKind(option.value);
                writeStoredValue(kindStorageKey, option.value);
                setCursorStack([]);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <OperatorSubmissionsTable
          onRetry={canRejudge ? retry : undefined}
          retryPending={retryMutation.isPending}
          onSelectOwner={(submissionId) =>
            setSelectedOwnerSubmissionId(submissionId)
          }
          onSelectProblem={(problemId) =>
            setSelectedProblemPreviewId(problemId)
          }
          onSelectSubmission={setSelectedSubmissionId}
          problemById={problemById}
          submissions={submissions}
        />
        <PaginationControls
          currentCount={submissions.length}
          currentCursor={page?.current_cursor ?? currentCursor ?? null}
          isFetching={submissionsQuery.isFetching}
          onNext={() => {
            if (page?.next_cursor) {
              setCursorStack((prev) => [...prev, page.next_cursor!]);
            }
          }}
          onPrevious={() => setCursorStack((prev) => prev.slice(0, -1))}
          pageSize={SUBMISSIONS_PAGE_SIZE}
          totalCount={page?.total_count ?? null}
          hasNext={Boolean(page?.next_cursor)}
          hasPrevious={cursorStack.length > 0}
        />
        {!submissionsQuery.isLoading && submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
            표시할 제출이 없습니다.
          </p>
        ) : null}
      </OperatorPanel>

      <RejudgingPanel
        contestId={contestId}
        token={token}
        canRejudge={canRejudge}
        target={rejudgingTarget}
        targetLabel={
          rejudgingTarget?.submission_id
            ? `제출 ${displaySubmissionId(rejudgingTarget.submission_id)}`
            : `${problemById.get(rejudgingTarget?.problem_id ?? '')?.problem_code ?? ''}. ${problemById.get(rejudgingTarget?.problem_id ?? '')?.title ?? ''}${rejudgingTarget?.team_id ? ` · ${filteredTeams.find((team) => team.participant_team_id === rejudgingTarget.team_id)?.team_name ?? '선택 팀'}` : ' · 모든 팀'}`
        }
        onCloseRequest={() => setRejudgingTarget(null)}
      />

      {selectedSubmissionId ? (
        <SubmissionDetailModal
          onRejudge={
            canRejudge
              ? (submissionId) => {
                  setSelectedSubmissionId('');
                  setRejudgingTarget({ submission_id: submissionId });
                }
              : undefined
          }
          onRetry={canRejudge ? retry : undefined}
          retryPending={retryMutation.isPending}
          error={selectedSubmissionQuery.error || retryMutation.error}
          isLoading={selectedSubmissionQuery.isLoading}
          onClose={() => setSelectedSubmissionId('')}
          problemById={problemById}
          submission={selectedSubmissionQuery.data}
        />
      ) : null}
      {selectedProblemPreview ? (
        <ProblemPreviewModal
          onClose={() => setSelectedProblemPreviewId('')}
          problem={selectedProblemPreview}
        />
      ) : null}
      {selectedOwnerSubmission ? (
        <TeamDetailModal
          onClose={() => setSelectedOwnerSubmissionId('')}
          submission={selectedOwnerSubmission}
          canViewParticipants={canViewParticipants}
          team={
            selectedOwnerSubmission.participant_team_id
              ? teamById.get(selectedOwnerSubmission.participant_team_id)
              : undefined
          }
        />
      ) : null}
    </PageLayout>
  );
}

function isOperatorTestSubmission(submission: Submission) {
  if (submission.submission_kind === 'operator_test') return true;
  return (
    submission.team_name?.startsWith('__operator_test__:') ||
    submission.team?.team_name?.startsWith('__operator_test__:') ||
    submission.participant_team_id?.startsWith('__operator_test__:')
  );
}

function isParticipantPreviewSubmission(submission: Submission) {
  return submission.submission_kind === 'participant_preview';
}

function submissionKindLabel(submission: Submission) {
  if (isParticipantPreviewSubmission(submission)) return '참가자 미리보기';
  if (isOperatorTestSubmission(submission)) return '문제 검수·테스트';
  if (isMockJudgingSubmission(submission)) return '모의채점';
  return '참가자 제출';
}

function isMockJudgingSubmission(submission: Submission) {
  return submission.submission_kind === 'mock_judging';
}

function displaySubmissionId(submissionId: string) {
  return submissionId.split('-')[0] || submissionId;
}

function submissionProblem(
  submission: Submission,
  problemById: Map<string, SubmissionProblem>,
) {
  return submission.problem ?? problemById.get(submission.problem_id) ?? null;
}

function submissionProblemLabel(
  submission: Submission,
  problemById: Map<string, SubmissionProblem>,
) {
  const problem = submissionProblem(submission, problemById);
  if (problem) return `${problem.problem_code}. ${problem.title}`;
  return (
    submission.problem_title ?? submission.problem_code ?? submission.problem_id
  );
}

function submissionOwner(submission: Submission) {
  if (isMockJudgingSubmission(submission)) return '모의채점';
  if (
    isOperatorTestSubmission(submission) ||
    isParticipantPreviewSubmission(submission)
  ) {
    return contestStaffDisplayName(
      submission.submitted_by_name,
      submission.submitted_by_title,
    );
  }
  const teamName = submission.team_name ?? submission.team?.team_name ?? '';
  const memberName = submission.member_name ?? submission.member?.name ?? '';
  if (teamName && memberName) return `${teamName}(${memberName})`;
  return teamName || memberName || '-';
}

function submissionMemberName(submission: Submission) {
  return submission.member_name ?? submission.member?.name ?? '-';
}

function submissionMemberEmail(submission: Submission) {
  return submission.member_email ?? submission.member?.email ?? '-';
}

function formatRuntime(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return `${value.toLocaleString('ko-KR')} ms`;
}

function codeLength(submission: Submission) {
  const length =
    submission.code_length_bytes ??
    submission.source_code_length ??
    submission.source_code?.length ??
    null;
  return typeof length === 'number'
    ? `${length.toLocaleString('ko-KR')} B`
    : '-';
}

function OperatorSubmissionsTable({
  onRetry,
  retryPending,
  onSelectOwner,
  onSelectProblem,
  onSelectSubmission,
  problemById,
  submissions,
}: {
  onRetry?: (submissionId: string) => void;
  retryPending: boolean;
  onSelectOwner: (submissionId: string) => void;
  onSelectProblem: (problemId: string) => void;
  onSelectSubmission: (submissionId: string) => void;
  problemById: Map<string, SubmissionProblem>;
  submissions: Submission[];
}) {
  const headerClass = 'border-r border-slate-200 px-4 py-3 last:border-r-0';
  const cellClass =
    'border-r border-slate-100 px-4 py-4 align-top last:border-r-0';

  return (
    <div className="zoj-horizontal-scroll rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>
            <th className={`${headerClass} w-28`}>제출</th>
            <th className={`${headerClass} w-44`}>팀/계정</th>
            <th className={`${headerClass} w-64`}>문제</th>
            <th className={`${headerClass} w-36`}>결과</th>
            <th className={`${headerClass} w-24`}>언어</th>
            <th className={`${headerClass} w-28`}>진행</th>
            <th className={`${headerClass} w-24`}>시간</th>
            <th className={`${headerClass} w-28`}>메모리</th>
            <th className={`${headerClass} w-32`}>제출 시각</th>
            <th className={`${headerClass} w-24`}>상세</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {submissions.map((submission) => {
            const problem = submissionProblem(submission, problemById);
            return (
              <tr
                className="hover:bg-indigo-50/40"
                key={submission.submission_id}
              >
                <td
                  className={`${cellClass} font-mono text-xs font-medium`}
                  title={submission.submission_id}
                >
                  {displaySubmissionId(submission.submission_id)}
                </td>
                <td className={`${cellClass} font-medium text-slate-800`}>
                  <button
                    className="zoj-truncate-safe max-w-full text-left text-indigo-700 hover:text-indigo-950"
                    onClick={() => onSelectOwner(submission.submission_id)}
                    title={submissionOwner(submission)}
                    type="button"
                  >
                    {submissionOwner(submission)}
                  </button>
                  <span className="mt-1.5 block w-fit rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                    {submissionKindLabel(submission)}
                  </span>
                </td>
                <td className={`${cellClass} font-medium`}>
                  {problem &&
                  problemById.get(problem.problem_id)?.statement !==
                    undefined ? (
                    <button
                      className="zoj-truncate-safe max-w-full text-left text-indigo-700 hover:text-indigo-950"
                      onClick={() => onSelectProblem(problem.problem_id)}
                      title={submissionProblemLabel(submission, problemById)}
                      type="button"
                    >
                      {submissionProblemLabel(submission, problemById)}
                    </button>
                  ) : (
                    <span
                      className="zoj-truncate-safe max-w-full"
                      title={submissionProblemLabel(submission, problemById)}
                    >
                      {submissionProblemLabel(submission, problemById)}
                    </span>
                  )}
                </td>
                <td className={cellClass}>
                  <SubmissionStatusBadge submission={submission} compact />
                  {onRetry && submission.status === 'system_error' ? (
                    <button
                      type="button"
                      disabled={retryPending}
                      onClick={() => onRetry(submission.submission_id)}
                      className="mt-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      재채점
                    </button>
                  ) : null}
                </td>
                <td className={`${cellClass} font-medium`}>
                  {judgeLanguageLabel(submission.language)}
                </td>
                <td
                  className={`${cellClass} text-xs font-medium text-slate-500`}
                >
                  {submissionProgressText(submission) || '-'}
                </td>
                <td className={cellClass}>
                  {formatRuntime(
                    submission.runtime_ms ??
                      submission.time_ms ??
                      submission.execution_time_ms,
                  )}
                </td>
                <td className={cellClass}>
                  {formatMemoryKb(
                    submission.memory_kb ??
                      submission.memory_usage_kb ??
                      submission.max_memory_kb,
                  )}
                </td>
                <td
                  className={`${cellClass} text-xs font-medium text-slate-500`}
                  title={formatDateTime(submission.submitted_at)}
                >
                  {formatRelativeTime(submission.submitted_at)}
                </td>
                <td className={cellClass}>
                  <button
                    className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold whitespace-nowrap text-indigo-700 hover:bg-indigo-50"
                    onClick={() => onSelectSubmission(submission.submission_id)}
                    type="button"
                  >
                    보기
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-600">
      <span>
        {totalCount === null
          ? `${start}-${end}`
          : `${start}-${end} / ${totalCount.toLocaleString('ko-KR')}`}
        {isFetching ? ' · 갱신 중' : ''}
      </span>
      <div className="flex gap-2">
        <button
          className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
          disabled={!hasPrevious || isFetching}
          onClick={onPrevious}
          type="button"
        >
          이전
        </button>
        <button
          className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
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

function ProblemPreviewModal({
  onClose,
  problem,
}: {
  onClose: () => void;
  problem: Problem;
}) {
  return (
    <ModalDialog
      aria-label="문제 미리보기"
      onClose={onClose}
      title={
        <>
          {problem.problem_code}. {problem.title}
        </>
      }
      eyebrow="문제 미리보기"
      size="xl"
      fill
      customBody
    >
      <div
        aria-label="문제 본문"
        tabIndex={0}
        className="min-h-0 overflow-y-auto overscroll-contain"
      >
        <ProblemStatementPanel problem={problem} />
      </div>
    </ModalDialog>
  );
}

function TeamDetailModal({
  onClose,
  submission,
  team,
  canViewParticipants,
}: {
  onClose: () => void;
  submission: Submission;
  team?: ParticipantTeam;
  canViewParticipants: boolean;
}) {
  const isOperatorTest = isOperatorTestSubmission(submission);
  const isMockJudging = isMockJudgingSubmission(submission);
  const isPreview = isParticipantPreviewSubmission(submission);
  const members = team?.members ?? [];
  const leader = members.find((member) => member.role === 'leader');

  return (
    <ModalDialog
      aria-label="팀 정보"
      onClose={onClose}
      title={submissionOwner(submission)}
      eyebrow="팀 정보"
      size="md"
      customBody
    >
      <div className="min-h-0 overflow-y-auto p-5">
        {isOperatorTest || isMockJudging || isPreview ? (
          <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-5 text-sm font-medium text-indigo-700">
            {isPreview
              ? '참가자 미리보기 화면에서 생성한 제출입니다. 실제 참가자의 기록과 점수판에는 반영되지 않습니다.'
              : isMockJudging
                ? '참가자 화면에서 종료 후 모의채점으로 생성된 제출입니다.'
                : '문제 모아보기 또는 문제 관리에서 생성한 검수·테스트 제출입니다. 실제 참가자의 기록과 점수판에는 반영되지 않습니다.'}
          </p>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <DetailCard
                label="팀 이름"
                value={team?.team_name ?? submissionOwner(submission)}
              />
              <DetailCard
                label="제출자"
                value={`${submissionMemberName(submission)} / ${submissionMemberEmail(submission)}`}
              />
              {canViewParticipants ? (
                <DetailCard
                  label="팀장"
                  value={
                    leader
                      ? `${leader.name} / ${leader.email}`
                      : '팀장 정보 없음'
                  }
                />
              ) : null}
              {canViewParticipants ? (
                <DetailCard label="상태" value={team?.status ?? '-'} />
              ) : null}
            </div>
            {canViewParticipants ? (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-slate-800">팀원</p>
                {members.length ? (
                  members.map((member) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm"
                      key={member.team_member_id ?? member.email}
                    >
                      <span className="min-w-0 font-semibold text-slate-950">
                        {member.name}
                      </span>
                      <span className="zoj-break-anywhere min-w-0 font-medium text-slate-500">
                        {member.email}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {member.role === 'leader' ? '팀장' : '팀원'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
                    팀 상세 정보를 불러오지 못했습니다.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}

function SubmissionDetailModal({
  onRejudge,
  onRetry,
  retryPending,
  error,
  isLoading,
  onClose,
  problemById,
  submission,
}: {
  onRejudge?: (submissionId: string) => void;
  onRetry?: (submissionId: string) => void;
  retryPending: boolean;
  error: unknown;
  isLoading: boolean;
  onClose: () => void;
  problemById: Map<string, SubmissionProblem>;
  submission?: Submission;
}) {
  return (
    <ModalDialog
      aria-label="제출 상세"
      onClose={onClose}
      title={
        submission
          ? submissionProblemLabel(submission, problemById)
          : '제출 상세'
      }
      eyebrow={
        submission
          ? `제출 상세 · ${displaySubmissionId(submission.submission_id)}`
          : '제출 상세'
      }
      description={
        submission
          ? `${submissionOwner(submission)} · ${formatDateTime(submission.submitted_at)}`
          : undefined
      }
      size="wide"
      fill
      customBody
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
        {isLoading ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
            제출 상세를 불러오는 중입니다.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {formatApiError(error, '제출 상세를 불러오지 못했습니다')}
          </p>
        ) : null}
        {onRejudge && canRejudgeSubmission(submission) ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 p-4">
            <p className="text-sm text-slate-600">
              기존 판정을 유지하며 다시 채점하고, 새 결과를 비교한 뒤
              반영합니다.
            </p>
            <button
              type="button"
              onClick={() => onRejudge(submission!.submission_id)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              결과 비교 재채점
            </button>
          </div>
        ) : null}
        {onRetry && submission?.status === 'system_error' ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 p-4">
            <p className="text-sm text-indigo-800">
              시스템 에러는 오답 패널티에 포함되지 않습니다. 같은 코드를 현재
              문제의 테스트와 제한으로 다시 채점합니다.
            </p>
            <button
              type="button"
              disabled={retryPending}
              onClick={() => onRetry(submission.submission_id)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {retryPending ? '요청 중…' : '시스템 에러 즉시 재채점'}
            </button>
          </div>
        ) : null}
        {submission ? (
          <SubmissionDetailContent
            key={submission.submission_id}
            submission={submission}
            owner={submissionOwner(submission)}
            kind={submissionKindLabel(submission)}
            runtime={formatRuntime(
              submission.runtime_ms ??
                submission.time_ms ??
                submission.execution_time_ms,
            )}
            memory={formatMemoryKb(
              submission.memory_kb ??
                submission.memory_usage_kb ??
                submission.max_memory_kb,
            )}
            codeLength={codeLength(submission)}
          />
        ) : null}
      </div>
    </ModalDialog>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <strong className="zoj-break-anywhere text-sm font-semibold text-slate-950">
        {value}
      </strong>
    </div>
  );
}
