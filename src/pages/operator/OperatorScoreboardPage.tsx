import Select from '@/shared/ui/Select';
import ScoreboardFreezeDialog, {
  type FreezeChange,
} from '@/components/operator/ScoreboardFreezeDialog';
import PresentationAccountCard from '@/components/operator/PresentationAccountCard';
import PresentationLaunchDialog from '@/components/operator/PresentationLaunchDialog';
import {
  presentationUrl,
  storedPresentationDivisions,
} from '@/domains/submissionScoreboard/presentationOptions';
import ModalDialog from '@/shared/ui/ModalDialog';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { sharedUiText } from '@/data/uiText';
import ScoreboardReleaseControl from '@/components/operator/ScoreboardReleaseControl';
import { isContestEnded } from '@/domains/contestAdministration/logic';
import ContestScoreboardTable from '@/components/contest/scoreboard/ContestScoreboardTable';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
  ScoreboardIcon,
} from '@/components/operator/OperatorShell';
import {
  getOperatorContestDashboard,
  updateContestSettings,
} from '@/domains/contestAdministration/api';
import type { ScoreboardFreezeMode } from '@/domains/contestAdministration/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import { getOperatorProblems } from '@/domains/problemManagement/api';
import type { Problem } from '@/domains/problemManagement/types';
import { getOperatorDivisionScoreboard } from '@/domains/submissionScoreboard/api';
import { scoreboardReleaseOption } from '@/domains/submissionScoreboard/releaseModes';
import type {
  ScoreboardProblemStat,
  ScoreboardProblemScore,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';

function operatorScoreboardDivisionStorageKey(contestId: string) {
  return `zoj.operator.scoreboard.division.${contestId}`;
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

function openPresentationPopup(contestId: string, divisionIds: string[]) {
  const url = presentationUrl(contestId, divisionIds);
  const width = Math.min(1600, window.screen.availWidth || window.innerWidth);
  const height = Math.min(
    1000,
    Math.max(320, (window.screen.availHeight || window.innerHeight) - 80),
  );
  const popup = window.open(
    url,
    `zoj-scoreboard-presentation-${contestId}`,
    `popup=yes,width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no`,
  );

  if (!popup) return false;
  popup.focus();
  return true;
}

function freezeRemainingLabel(freezeAt?: string | null) {
  if (!freezeAt) return '-';

  const diffMs = new Date(freezeAt).getTime() - Date.now();
  if (diffMs <= 0) return '프리즈 시각이 지났습니다';

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}일 ${hours}시간 ${minutes}분 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}

function formatPenalty(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('ko-KR');
}

function formatAcceptanceRate(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return `${value.toLocaleString('ko-KR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  })}%`;
}

function formatElapsedMinuteLabel(value?: number | null) {
  if (value === undefined || value === null) return '-';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours <= 0) return `${minutes.toLocaleString('ko-KR')}분`;
  if (minutes === 0) return `${hours.toLocaleString('ko-KR')}시간`;
  return `${hours.toLocaleString('ko-KR')}시간 ${minutes}분`;
}

function problemLabel(
  score: ScoreboardProblemScore,
  problemById: Map<string, Problem>,
) {
  const problem = score.problem_id ? problemById.get(score.problem_id) : null;
  if (!problem) return score.problem_code;
  return `${problem.problem_code}. ${problem.title}`;
}

function elapsedMinutes(
  score: ScoreboardProblemScore,
  contestStartAt?: string | null,
) {
  if (contestStartAt && score.solved_at) {
    const diff =
      new Date(score.solved_at).getTime() - new Date(contestStartAt).getTime();
    if (Number.isFinite(diff)) return Math.max(0, Math.floor(diff / 60_000));
  }

  if (score.penalty === undefined || score.penalty === null) return null;
  return Math.max(0, score.penalty - score.wrong_attempts * 20);
}

function PenaltyBreakdownModal({
  contestStartAt,
  onClose,
  problemById,
  row,
}: {
  contestStartAt?: string | null;
  onClose: () => void;
  problemById: Map<string, Problem>;
  row: ScoreboardRow;
}) {
  const solvedScores = row.problem_scores.filter((score) => score.solved);
  const unsolvedAttemptCount = row.problem_scores
    .filter((score) => !score.solved)
    .reduce((sum, score) => sum + score.attempts, 0);

  return (
    <ModalDialog
      aria-label="총시간 계산 상세"
      onClose={onClose}
      title={
        <>
          {row.team_name} · 총시간 {formatPenalty(row.penalty)}
        </>
      }
      eyebrow="총시간 계산 상세"
      size="lg"
      customBody
    >
      <div className="min-h-0 overflow-y-auto p-5">
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm font-medium text-indigo-900">
            <p>
              총시간은 정답을 맞힌 문제들의 시간과 오답 패널티를 합산한
              값입니다.
            </p>
            <p className="text-indigo-700">
              문제별 계산: 정답 제출까지 걸린 분 + 정답 전 실패 횟수 × 20분
            </p>
          </div>

          {solvedScores.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="border-r border-slate-200 px-4 py-3">
                      문제
                    </th>
                    <th className="border-r border-slate-200 px-4 py-3">
                      정답 시각
                    </th>
                    <th className="border-r border-slate-200 px-4 py-3 text-right">
                      기본 시간
                    </th>
                    <th className="border-r border-slate-200 px-4 py-3 text-right">
                      실패
                    </th>
                    <th className="px-4 py-3 text-right">문제별 패널티</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {solvedScores.map((score) => {
                    const elapsed = elapsedMinutes(score, contestStartAt);
                    const wrongPenalty = score.wrong_attempts * 20;
                    return (
                      <tr key={score.problem_id ?? score.problem_code}>
                        <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-950">
                          {problemLabel(score, problemById)}
                        </td>
                        <td className="border-r border-slate-100 px-4 py-3 font-medium text-slate-500">
                          {formatDateTime(score.solved_at ?? undefined)}
                        </td>
                        <td className="border-r border-slate-100 px-4 py-3 text-right font-medium text-slate-700">
                          {elapsed === null
                            ? '-'
                            : `${elapsed.toLocaleString('ko-KR')}분`}
                        </td>
                        <td className="border-r border-slate-100 px-4 py-3 text-right font-medium text-slate-700">
                          {score.wrong_attempts.toLocaleString('ko-KR')}회 × 20
                          = {wrongPenalty.toLocaleString('ko-KR')}분
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                          {formatPenalty(score.penalty)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
              해결한 문제가 없어 총시간은 0입니다.
            </p>
          )}

          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
            <p>
              합계: {solvedScores.length}개 해결, 총시간{' '}
              {formatPenalty(row.penalty)}
            </p>
            <p>
              미해결 문제의 실패 시도{' '}
              {unsolvedAttemptCount.toLocaleString('ko-KR')}회는 총시간에 더하지
              않고, 동점 정렬용 시도 수로만 사용됩니다.
            </p>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

function ProblemStatsBlock({
  problemStats,
  problems,
}: {
  problemStats: ScoreboardProblemStat[];
  problems: Problem[];
}) {
  const rows = useMemo(() => {
    const statsByProblemId = new Map(
      problemStats.map((stat) => [stat.problem_id, stat]),
    );
    const problemIds = new Set(problems.map((problem) => problem.problem_id));
    const problemRows = problems.map((problem) => ({
      problem,
      stat:
        statsByProblemId.get(problem.problem_id) ??
        ({
          problem_id: problem.problem_id,
          problem_code: problem.problem_code,
          total_submissions: 0,
          accepted_submissions: 0,
          accepted_team_count: 0,
          total_team_count: 0,
          acceptance_rate: null,
          first_accepted_team_id: null,
          first_accepted_team_name: null,
          first_accepted_at: null,
          first_accepted_elapsed_minutes: null,
        } satisfies ScoreboardProblemStat),
    }));
    const orphanRows = problemStats
      .filter((stat) => !problemIds.has(stat.problem_id))
      .map((stat) => ({ problem: null, stat }));

    return [...problemRows, ...orphanRows];
  }, [problemStats, problems]);

  if (!rows.length) return null;

  return (
    <section className="mt-5 grid gap-3 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase">
            Problem statistics
          </p>
          <h3 className="text-base font-semibold text-slate-950">
            문제별 제출 통계
          </h3>
        </div>
        <p className="text-xs font-medium text-slate-500">
          정답률은 정답 제출 수 / 총 제출 수 기준입니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              <th className="border-r border-slate-200 px-4 py-3">문제</th>
              <th className="border-r border-slate-200 px-4 py-3 text-right">
                총 제출
              </th>
              <th className="border-r border-slate-200 px-4 py-3 text-right">
                정답률
              </th>
              <th className="border-r border-slate-200 px-4 py-3 text-right">
                정답 팀
              </th>
              <th className="border-r border-slate-200 px-4 py-3">
                첫 정답 팀
              </th>
              <th className="px-4 py-3">첫 정답 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ problem, stat }) => (
              <tr key={stat.problem_id}>
                <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-950">
                  {problem
                    ? `${problem.problem_code}. ${problem.title}`
                    : stat.problem_code}
                </td>
                <td className="border-r border-slate-100 px-4 py-3 text-right font-medium text-slate-700">
                  {stat.total_submissions.toLocaleString('ko-KR')}
                </td>
                <td className="border-r border-slate-100 px-4 py-3 text-right font-semibold text-indigo-700">
                  {formatAcceptanceRate(stat.acceptance_rate)}
                </td>
                <td className="border-r border-slate-100 px-4 py-3 text-right font-medium text-slate-700">
                  {stat.accepted_team_count.toLocaleString('ko-KR')}
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    / {(stat.total_team_count ?? 0).toLocaleString('ko-KR')}팀
                  </span>
                </td>
                <td className="zoj-break-anywhere border-r border-slate-100 px-4 py-3 font-medium text-slate-700">
                  {stat.first_accepted_team_name ?? '아직 없음'}
                </td>
                <td className="px-4 py-3 font-medium text-slate-600">
                  {stat.first_accepted_at ? (
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-950">
                        {formatElapsedMinuteLabel(
                          stat.first_accepted_elapsed_minutes,
                        )}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(stat.first_accepted_at)}
                      </span>
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function OperatorScoreboardPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate contestId={contestId}>
      {(session) =>
        contestId ? (
          <OperatorScoreboardContent
            key={`${contestId}:${hasContestPermission(session, contestId, 'contest.scoreboard.view')}`}
            canReadLive={hasContestPermission(
              session,
              contestId,
              'contest.scoreboard.view',
            )}
            canManage={hasContestPermission(
              session,
              contestId,
              'contest.scoreboard.manage',
            )}
            canReadProblems={hasContestPermission(
              session,
              contestId,
              'contest.problem.view',
            )}
            contestId={contestId}
            token={session.accessToken}
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

function ScoreboardFreezeControl({
  canManage,
  disabled,
  error,
  freezeAt,
  mode,
  onChange,
  publicFrozen,
}: {
  canManage: boolean;
  disabled: boolean;
  error: unknown;
  freezeAt?: string | null;
  mode: ScoreboardFreezeMode;
  onChange: (mode: ScoreboardFreezeMode) => void;
  publicFrozen: boolean;
}) {
  const options: {
    description: string;
    label: string;
    value: ScoreboardFreezeMode;
  }[] = [
    {
      description: '프리즈 시간이 지나면 공개 스코어보드를 자동으로 멈춤',
      label: '오토',
      value: 'auto',
    },
    {
      description: '프리즈 시간 이후에도 공개 스코어보드를 실시간 유지',
      label: '라이브',
      value: 'live',
    },
    {
      description: '지금 기준으로 공개 스코어보드를 프리즈 상태로 유지',
      label: '프리즈',
      value: 'frozen',
    },
  ];

  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase">
            Public scoreboard
          </p>
          <h2 className="text-base font-semibold text-slate-950">
            공개 스코어보드 표시
          </h2>
        </div>
        {canManage ? (
          <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:inline-grid sm:grid-cols-3">
            {options.map((option) => (
              <button
                className={[
                  'h-10 rounded-lg px-5 text-sm font-semibold transition disabled:cursor-not-allowed',
                  mode === option.value
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-slate-950',
                ].join(' ')}
                disabled={disabled || mode === option.value}
                aria-pressed={mode === option.value}
                key={option.value}
                onClick={() => onChange(option.value)}
                type="button"
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
            표시 모드: {options.find((option) => option.value === mode)?.label}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">
          기본 운용은 프리즈 시간 자동 적용입니다. 라이브와 프리즈는 수동 유지
          모드입니다.
        </p>
        <span
          className={[
            'rounded-full border px-3 py-1 text-xs font-semibold',
            publicFrozen
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          공개 화면: {publicFrozen ? '프리즈 적용 중' : '라이브'}
        </span>
      </div>
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500">
            프리즈 기준 시각
          </p>
          <p className="mt-1 font-semibold text-slate-950">
            {formatDateTime(freezeAt ?? undefined)}
          </p>
        </div>
        <p className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
          {freezeRemainingLabel(freezeAt)}
        </p>
      </div>
      {mode !== 'auto' ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          현재 공개 스코어보드는 수동 {mode === 'live' ? '라이브' : '프리즈'}{' '}
          모드입니다.
          {canManage
            ? ' 프리즈 시각 기준으로 자동 전환하려면 오토로 변경해 주세요.'
            : ''}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {formatApiError(error, '스코어보드 공개 상태를 변경하지 못했습니다')}
        </p>
      ) : null}
    </section>
  );
}

function OperatorScoreboardContent({
  canManage,
  canReadLive,
  canReadProblems,
  contestId,
  token,
}: {
  canManage: boolean;
  canReadLive: boolean;
  canReadProblems: boolean;
  contestId: string;
  token: string;
}) {
  const [freezeChange, setFreezeChange] = useState<FreezeChange | null>(null);
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const divisionStorageKey = operatorScoreboardDivisionStorageKey(contestId);
  const [selectedDivisionId, setDivisionId] = useState(() =>
    readStoredValue(divisionStorageKey),
  );
  const [selectedPenaltyRow, setSelectedPenaltyRow] =
    useState<ScoreboardRow | null>(null);
  const [presentationPopupBlocked, setPresentationPopupBlocked] =
    useState(false);
  const [presentationSetupOpen, setPresentationSetupOpen] = useState(false);
  const [presentationLaunchIds, setPresentationLaunchIds] = useState<string[]>(
    [],
  );
  const presentationStorageKey = `zoj.operator.presentation.divisions.${contestId}`;
  const [, setClock] = useState(Date.now);

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isVisible]);

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
    placeholderData: keepPreviousData,
    refetchInterval: isVisible ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const contest = dashboardQuery.data?.contest;
  const canViewBoard =
    canReadLive ||
    ['running', 'ended', 'finalized', 'archived'].includes(
      contest?.status ?? '',
    );
  const problemsQuery = useQuery({
    enabled: canReadProblems && canViewBoard,
    queryKey: ['operator', 'problems', contestId, queryIdentity],
    queryFn: () => getOperatorProblems(contestId, token),
    placeholderData: keepPreviousData,
  });
  const divisions = dashboardQuery.data?.divisions ?? [];
  const divisionId = divisions.some(
    (division) => division.division_id === selectedDivisionId,
  )
    ? selectedDivisionId
    : (divisions[0]?.division_id ?? '');
  const scoreboardQuery = useQuery({
    enabled: Boolean(divisionId) && canViewBoard,
    queryKey: [
      'operator',
      'scoreboard',
      contestId,
      divisionId,
      queryIdentity,
      canReadLive,
    ],
    queryFn: () => getOperatorDivisionScoreboard(contestId, divisionId, token),
    refetchInterval: isVisible ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const freezeModeMutation = useMutation({
    mutationFn: (mode: ScoreboardFreezeMode) => {
      if (!canManage) {
        return Promise.reject(new Error('스코어보드 관리 권한이 없습니다.'));
      }
      return updateContestSettings(contestId, token, {
        scoreboard_freeze_mode: mode,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'scoreboard', contestId],
      });
    },
  });

  const liveView =
    canReadLive && scoreboardQuery.data?.operator_live_view !== false;
  const freezeMode = contest?.scoreboard_freeze_mode ?? 'auto';
  const releaseMode = contest?.scoreboard_release_mode ?? 'manual';
  const releaseOption = scoreboardReleaseOption(releaseMode);
  const ended = Boolean(contest && isContestEnded(contest));
  const problems = (canReadProblems ? (problemsQuery.data ?? []) : []).filter(
    (problem) => (divisionId ? problem.division_id === divisionId : true),
  );
  const problemById = useMemo(
    () => new Map(problems.map((problem) => [problem.problem_id, problem])),
    [problems],
  );

  const rows = scoreboardQuery.data?.rows ?? [];
  const penaltyRow = rows.find(
    (row) => row.team_id === selectedPenaltyRow?.team_id,
  );
  const problemStats = scoreboardQuery.data?.problem_stats ?? [];

  if (!canViewBoard)
    return (
      <PageLayout
        navigation={<OperatorTabs contestId={contestId} />}
        variant="management"
        title="스코어보드"
      >
        <p
          role="status"
          className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600"
        >
          {dashboardQuery.isPending
            ? '대회 상태를 확인하고 있습니다.'
            : dashboardQuery.error
              ? formatApiError(
                  dashboardQuery.error,
                  '대회 상태를 불러오지 못했습니다',
                )
              : '대회 시작 후 참가자와 같은 스코어보드를 볼 수 있습니다.'}
        </p>
      </PageLayout>
    );

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      description={
        liveView
          ? '운영자용 내부 순위입니다. 프리즈 이후에도 최신 채점 결과가 반영됩니다.'
          : '참가자와 같은 순위표입니다. 프리즈와 순위 공개 정책이 적용됩니다.'
      }
      eyebrow="Operator"
      title="스코어보드"
      width="full"
    >
      {presentationSetupOpen && (
        <PresentationLaunchDialog
          divisions={divisions}
          initialSelection={storedPresentationDivisions(
            readStoredValue(presentationStorageKey),
            divisions.map((division) => division.division_id),
            divisionId,
          )}
          onClose={() => setPresentationSetupOpen(false)}
          onLaunch={(ids) => {
            setPresentationLaunchIds(ids);
            writeStoredValue(presentationStorageKey, JSON.stringify(ids));
            setPresentationPopupBlocked(!openPresentationPopup(contestId, ids));
            setPresentationSetupOpen(false);
          }}
        />
      )}
      {freezeChange && contest ? (
        <ScoreboardFreezeDialog
          key={`${freezeChange.from}-${freezeChange.to}`}
          change={freezeChange}
          contest={contest}
          unavailable={ended || freezeModeMutation.isPending}
          onCancel={() => setFreezeChange(null)}
          onConfirm={() => {
            if (
              canManage &&
              !ended &&
              !freezeModeMutation.isPending &&
              freezeChange.from === freezeMode &&
              freezeChange.freezeAt === contest.freeze_at
            ) {
              const nextMode = freezeChange.to;
              setFreezeChange(null);
              freezeModeMutation.mutate(nextMode);
            }
          }}
        />
      ) : null}
      {canManage && liveView ? (
        <PresentationAccountCard contestId={contestId} token={token} />
      ) : null}

      {contest && liveView ? (
        <section
          aria-label="종료 후 순위 공개 방식"
          className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-950">
              종료 후 순위 공개
            </h2>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
              {releaseOption.label}
            </span>
            <span className="text-xs text-slate-500">
              대회 설정에서 선택한 방식
            </span>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            {releaseOption.description}
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="공개 진행 순서">
            {releaseOption.flow.map((step, index) => (
              <li
                key={step}
                className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                <span className="mr-2 font-semibold text-indigo-600">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-xs leading-5 text-slate-500">
            {releaseMode === 'immediate'
              ? ended
                ? '종료되어 프리즈가 자동 해제되었습니다. 별도의 공개 조작은 필요하지 않습니다.'
                : '종료 시각이 되거나 대회 상태를 종료로 바꾸면 자동 공개됩니다.'
              : ended
                ? canManage
                  ? '아래에서 참가 유형을 선택하고 공개를 진행하세요. 남은 채점이 있으면 발표를 시작할 수 없습니다.'
                  : '스코어보드 관리 권한이 있는 운영자가 유형별로 공개를 진행합니다.'
                : '대회가 종료되면 아래 순위표 영역에 유형별 발표 조작이 나타납니다.'}{' '}
            참가자와 프레젠테이션에 함께 반영되며, 프레젠테이션은 결과만
            표시합니다.
          </p>
          {contest.scoreboard_access_after_end === 'private' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              종료 후 스코어보드 열람 범위가 비공개입니다. 발표는 프레젠테이션에
              표시되지만 참가자 페이지에서는 볼 수 없습니다.
            </p>
          ) : null}
          {freezeMode === 'live' && releaseMode !== 'immediate' ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {ended
                ? releaseMode === 'manual'
                  ? '대회 중 라이브 모드로 운영했습니다. 공개 시작 전까지 프리즈 없이 최신 성적이 표시되며, 개별 순위 공개를 시작하면 팀 정보가 가려집니다.'
                  : '대회 중 라이브 모드에서 프리즈 이후 성적도 이미 공개되었습니다. 종료 후에는 결과 순차 공개를 위해 프리즈 기준 표가 표시됩니다.'
                : '라이브 모드에서는 프리즈 이후 성적도 이미 공개됩니다. 순차 발표를 준비한다면 오토로 전환하세요.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {contest && !ended && liveView ? (
        <ScoreboardFreezeControl
          canManage={canManage}
          disabled={freezeModeMutation.isPending}
          error={freezeModeMutation.error}
          freezeAt={contest?.freeze_at}
          mode={freezeMode}
          onChange={(mode) => {
            if (
              canManage &&
              contest &&
              mode !== freezeMode &&
              !freezeModeMutation.isPending
            ) {
              setFreezeChange({
                from: freezeMode,
                to: mode,
                freezeAt: contest.freeze_at,
              });
            }
          }}
          publicFrozen={Boolean(scoreboardQuery.data?.frozen_public_view)}
        />
      ) : null}

      {dashboardQuery.error || problemsQuery.error || scoreboardQuery.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {formatApiError(
            dashboardQuery.error ||
              problemsQuery.error ||
              scoreboardQuery.error,
            '스코어보드를 불러오지 못했습니다',
          )}
        </div>
      ) : null}

      <OperatorPanel
        actions={
          <>
            {liveView ? (
              <button
                className="zoj-pressable inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                disabled={!divisions.length}
                onClick={() => setPresentationSetupOpen(true)}
                type="button"
              >
                <ScoreboardIcon />
                프레젠테이션 팝업
              </button>
            ) : null}
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ScoreboardIcon />
              <Select
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => {
                  setDivisionId(event.target.value);
                  writeStoredValue(divisionStorageKey, event.target.value);
                }}
                value={divisionId}
              >
                {divisions.map((division) => (
                  <option
                    key={division.division_id}
                    value={division.division_id}
                  >
                    {division.name}
                  </option>
                ))}
              </Select>
            </label>
          </>
        }
        description="유형별 스코어보드를 확인합니다."
        title="순위표"
      >
        {presentationPopupBlocked ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            브라우저에서 팝업이 차단되었습니다. 팝업을 허용하거나{' '}
            <a
              className="font-medium underline underline-offset-4"
              href={presentationUrl(contestId, presentationLaunchIds)}
              target="_blank"
              rel="noreferrer"
            >
              새 탭에서 프레젠테이션 열기
            </a>
            를 선택하세요.
          </p>
        ) : null}
        {canManage && liveView && contest && ended && divisionId ? (
          <ScoreboardReleaseControl
            key={divisionId}
            contestId={contestId}
            divisionId={divisionId}
            divisionName={
              divisions.find((division) => division.division_id === divisionId)
                ?.name ?? '선택 유형'
            }
            token={token}
            strategy={releaseMode}
          />
        ) : null}
        {scoreboardQuery.data?.frozen_public_view ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {liveView
              ? '공개 스코어보드는 프리즈 상태입니다. 이 화면은 최신 성적을 보여주는 운영자 내부 순위입니다.'
              : '프리즈가 적용된 참가자 순위표입니다. 미공개 채점 결과는 표시되지 않습니다.'}
          </p>
        ) : null}
        <ContestScoreboardTable
          release={scoreboardQuery.data?.release}
          onSelectPenaltyBreakdown={setSelectedPenaltyRow}
          problems={problems}
          rows={rows}
        />
        {scoreboardQuery.data ? (
          <ProblemStatsBlock problemStats={problemStats} problems={problems} />
        ) : null}
        {!scoreboardQuery.isLoading && rows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
            표시할 스코어보드가 없습니다.
          </p>
        ) : null}
      </OperatorPanel>
      {penaltyRow ? (
        <PenaltyBreakdownModal
          contestStartAt={contest?.start_at}
          onClose={() => setSelectedPenaltyRow(null)}
          problemById={problemById}
          row={penaltyRow}
        />
      ) : null}
    </PageLayout>
  );
}
