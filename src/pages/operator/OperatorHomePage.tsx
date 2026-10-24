import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import OperatorContestStatus from '@/components/operator/OperatorContestStatus';
import ContestShareButton from '@/components/operator/ContestShareButton';
import {
  JudgeIcon,
  OperatorAccessGate,
  OperatorMetricCard,
  OperatorPanel,
  OperatorTabs,
  ProblemIcon,
  ScoreboardIcon,
  SettingsIcon,
  TeamIcon,
} from '@/components/operator/OperatorShell';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  hasContestPermission,
  operatorHomePermissions,
  type ContestPermissionCode,
} from '@/domains/identityAccess/permissions';
import type { StaffSession } from '@/domains/identityAccess/types';
import { formatApiError } from '@/shared/api/errors';
import AnimatedNumber from '@/shared/ui/AnimatedNumber';

export default function OperatorHomePage() {
  const { contestId } = useParams();

  if (!contestId) {
    return <Navigate replace to="/contests" />;
  }

  return (
    <OperatorAccessGate contestId={contestId} permission="contest.view">
      {(session) =>
        !hasContestPermission(session, contestId, operatorHomePermissions) &&
        hasContestPermission(session, contestId, [
          'contest.problem.view',
          'contest.problem.review',
        ]) ? (
          <Navigate
            replace
            to={`/operator/contests/${contestId}/problem-review`}
          />
        ) : (
          <OperatorHomeContent contestId={contestId} session={session} />
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorHomeContent({
  contestId,
  session,
}: {
  contestId: string;
  session: StaffSession;
}) {
  const token = session.accessToken;
  const queryIdentity = tokenQueryIdentity(token);
  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
    refetchInterval: 15_000,
  });
  const dashboard = dashboardQuery.data;
  const contest = dashboard?.contest;
  const can = (
    permission: ContestPermissionCode | readonly ContestPermissionCode[],
  ) => hasContestPermission(session, contestId, permission, contest?.status);

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      description="운영 권한이 있는 대회의 참가팀, 문제, 제출, 공지를 관리합니다."
      eyebrow="Operator"
      title="운영 홈"
      actions={
        <ContestShareButton
          key={contestId}
          contestId={contestId}
          token={token}
        />
      }
      width="full"
    >
      {dashboardQuery.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {formatApiError(
            dashboardQuery.error,
            '운영자 데이터를 불러오지 못했습니다',
          )}
        </div>
      ) : null}

      <div className="grid gap-6">
        {contest ? (
          <OperatorContestStatus
            contest={contest}
            canManageSettings={can('contest.settings.manage')}
            stale={dashboardQuery.isError}
          />
        ) : dashboardQuery.isPending ? (
          <div className="zoj-card text-sm text-slate-500" role="status">
            대회 진행 상태를 불러오고 있습니다.
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {can('contest.participant.view') ? (
            <OperatorMetricCard
              description="전체 참가팀"
              icon={<TeamIcon />}
              label="참가팀"
              tone="indigo"
              value={
                <AnimatedNumber value={dashboard?.participant_count ?? 0} />
              }
            />
          ) : null}
          {can('contest.submission.view') ? (
            <OperatorMetricCard
              description="전체 제출 수"
              icon={<JudgeIcon />}
              label="제출"
              tone="cyan"
              value={
                <AnimatedNumber value={dashboard?.submission_count ?? 0} />
              }
            />
          ) : null}
          {can('contest.submission.view') ? (
            <OperatorMetricCard
              description="대기 중인 채점"
              icon={<JudgeIcon />}
              label="대기 채점"
              tone="amber"
              value={<AnimatedNumber value={dashboard?.pending_jobs ?? 0} />}
            />
          ) : null}
          <OperatorMetricCard
            description="등록된 유형"
            icon={<SettingsIcon />}
            label="유형"
            tone="emerald"
            value={<AnimatedNumber value={dashboard?.divisions.length ?? 0} />}
          />
        </div>

        <OperatorPanel title="운영 작업">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {can('contest.settings.manage') ? (
              <OperatorQuickLink
                icon={<SettingsIcon />}
                label="대회 설정"
                to={`/operator/contests/${contestId}/settings`}
              />
            ) : null}
            {can('contest.staff.manage') ? (
              <OperatorQuickLink
                icon={<TeamIcon />}
                label="운영자 추가"
                to={`/operator/contests/${contestId}/operators`}
              />
            ) : null}
            {can('contest.participant.view') ? (
              <OperatorQuickLink
                icon={<TeamIcon />}
                label="참가팀 관리"
                to={`/operator/contests/${contestId}/participants`}
              />
            ) : null}
            {can('contest.problem.manage') ? (
              <OperatorQuickLink
                icon={<ProblemIcon />}
                label="문제 관리"
                to={`/operator/contests/${contestId}/problems`}
              />
            ) : null}
            {can(['contest.problem.view', 'contest.problem.review']) ? (
              <OperatorQuickLink
                icon={<ProblemIcon />}
                label="문제 모아보기"
                to={`/operator/contests/${contestId}/problem-review`}
              />
            ) : null}
            {can('contest.submission.view') ? (
              <OperatorQuickLink
                icon={<JudgeIcon />}
                label="제출 확인"
                to={`/operator/contests/${contestId}/submissions`}
              />
            ) : null}
            {can('contest.notice.view') ? (
              <OperatorQuickLink
                icon={<SettingsIcon />}
                label={can('contest.notice.manage') ? '공지 관리' : '공지'}
                to={`/operator/contests/${contestId}/notices`}
              />
            ) : null}
            {can('contest.board.question.view') ? (
              <OperatorQuickLink
                icon={<SettingsIcon />}
                label={
                  can('contest.board.question.manage')
                    ? '게시글 관리'
                    : '게시판'
                }
                to={`/operator/contests/${contestId}/board`}
              />
            ) : null}
            {can('contest.scoreboard.view') ? (
              <OperatorQuickLink
                icon={<ScoreboardIcon />}
                label="스코어보드"
                to={`/operator/contests/${contestId}/scoreboard`}
              />
            ) : null}
          </div>
        </OperatorPanel>

        <OperatorPanel title="참가 유형">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="border-r border-b border-slate-200 px-4 py-3">
                    유형
                  </th>
                  <th className="border-r border-b border-slate-200 px-4 py-3">
                    설명
                  </th>
                  <th className="border-r border-b border-slate-200 px-4 py-3">
                    코드
                  </th>
                  {can('contest.participant.view') ? (
                    <th className="border-b border-slate-200 px-4 py-3">
                      참가팀
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dashboard?.divisions ?? []).map((division) => (
                  <tr
                    className="hover:bg-indigo-50/40"
                    key={division.division_id}
                  >
                    <td className="border-r border-slate-100 px-4 py-4 font-semibold text-slate-950">
                      {division.name}
                    </td>
                    <td className="zoj-break-anywhere border-r border-slate-100 px-4 py-4 font-medium text-slate-600">
                      {division.description || '-'}
                    </td>
                    <td className="border-r border-slate-100 px-4 py-4 font-medium text-slate-600">
                      {division.code || '-'}
                    </td>
                    {can('contest.participant.view') ? (
                      <td className="px-4 py-4 font-medium text-slate-700">
                        {dashboard?.participant_count_by_division[
                          division.division_id
                        ] ?? 0}
                        팀
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OperatorPanel>
      </div>
    </PageLayout>
  );
}

function OperatorQuickLink({
  icon,
  label,
  to,
}: {
  icon: ReactNode;
  label: string;
  to: string;
}) {
  return (
    <Link className="operator-quick-link" to={to}>
      {icon}
      {label}
    </Link>
  );
}
