import { hasOperatorAnswer } from '@/domains/serviceCommunication/boardPresentation';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import {
  hasParticipantPreviewAccess,
  participantPreviewPath,
} from '@/domains/identityAccess/participantPreview';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { ManagementPanel } from '@/components/common/ManagementCards';
import { accessText, operatorNavText } from '@/data/uiText';
import { contestRoleTitleForAccount } from '@/domains/identityAccess/contestRoles';
import {
  hasContestPermission,
  isServiceMaster,
  operatorHomePermissions,
  type ContestPermissionCode,
} from '@/domains/identityAccess/permissions';
import type {
  GeneralSession,
  StaffSession,
} from '@/domains/identityAccess/types';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { getOperatorProblems } from '@/domains/problemManagement/api';
import {
  listOperatorContestNotices,
  listOperatorContestQuestions,
} from '@/domains/serviceCommunication/api';

type OperatorAccessGateProps = {
  children: (session: StaffSession) => ReactNode;
  contestId?: string;
  permission?: ContestPermissionCode | readonly ContestPermissionCode[];
};

type OperatorTabsProps = {
  contestId?: string;
};

type OperatorPanelProps = {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title: string;
};

type OperatorMetricCardProps = {
  description?: ReactNode;
  icon: ReactNode;
  label: string;
  tone?: 'indigo' | 'cyan' | 'emerald' | 'amber' | 'slate';
  value: ReactNode;
};

const toneClassNames = {
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

const operatorTabs = [
  {
    label: operatorNavText.home,
    path: '',
    icon: DashboardIcon,
    end: true,
    permission: operatorHomePermissions,
  },
  {
    label: operatorNavText.settings,
    path: 'settings',
    icon: SettingsIcon,
    permission: 'contest.settings.manage',
  },
  {
    label: operatorNavText.operators,
    path: 'operators',
    icon: TeamIcon,
    permission: 'contest.staff.manage',
  },
  {
    label: operatorNavText.notices,
    path: 'notices',
    icon: NoticeIcon,
    permission: 'contest.notice.view',
  },
  {
    label: operatorNavText.board,
    path: 'board',
    icon: NoticeIcon,
    permission: 'contest.board.question.view',
  },
  {
    label: operatorNavText.participants,
    path: 'participants',
    icon: TeamIcon,
    permission: 'contest.participant.view',
  },
  {
    label: operatorNavText.problems,
    path: 'problems',
    icon: ProblemIcon,
    permission: 'contest.problem.manage',
  },
  {
    label: operatorNavText.problemReview,
    path: 'problem-review',
    icon: ProblemIcon,
    permission: ['contest.problem.view', 'contest.problem.review'],
  },
  {
    label: operatorNavText.submissions,
    path: 'submissions',
    icon: JudgeIcon,
    permission: 'contest.submission.view',
  },
  {
    label: operatorNavText.scoreboard,
    path: 'scoreboard',
    icon: ScoreboardIcon,
    permission: 'contest.scoreboard.view',
  },
  {
    label: operatorNavText.auditLogs,
    path: 'audit-logs',
    icon: NoticeIcon,
    permission: ['contest.audit.view', 'contest.access_log.view'],
  },
  {
    label: '운영 가이드',
    path: 'guide',
    icon: GuideBookIcon,
    permission: undefined,
  },
] as const;

function countLabel(count: number, unit = '건') {
  return count > 0 ? `${count}${unit}` : '';
}

function staffSessionFromGeneralSession(
  session: GeneralSession | null,
): StaffSession | null {
  if (!session) return null;
  if (session.operatorSession) return session.operatorSession;
  if (!session.operatorContests.length && !isServiceMaster(session))
    return null;

  return {
    accessToken: session.accessToken,
    defaultRedirect: '/operator',
    refreshToken: session.refreshToken,
    staff: {
      contest_scopes: Object.fromEntries(
        session.operatorContests.map((entry) => [
          entry.contest.contest_id,
          entry.scopes,
        ]),
      ),
      display_name: session.account.display_name,
      email: session.account.email,
      is_service_master: isServiceMaster(session),
    },
  };
}

export function OperatorAccessGate({
  children,
  contestId,
  permission,
}: OperatorAccessGateProps) {
  const generalSession = useSessionStore((state) => state.generalSession);
  const staffSession = staffSessionFromGeneralSession(generalSession);

  if (!staffSession) {
    return (
      <PageLayout
        variant="management"
        description={accessText.operatorLoginDescription}
        title={accessText.operatorLoginTitle}
      >
        <Link
          className="w-fit rounded-lg border border-indigo-200 bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          to="/login"
        >
          {accessText.loginPageLink}
        </Link>
      </PageLayout>
    );
  }

  if (
    contestId &&
    !hasContestPermission(generalSession, contestId, permission)
  ) {
    return (
      <PageLayout
        variant="management"
        description={accessText.operatorNoPermissionDescription}
        title={accessText.operatorNoPermissionTitle}
      >
        <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
          <p>{accessText.operatorNoPermissionMessage}</p>
          <Link className="w-fit underline underline-offset-4" to="/operator">
            {accessText.operatorReturnLink}
          </Link>
        </div>
      </PageLayout>
    );
  }

  return children(staffSession);
}

export function OperatorTabs({ contestId }: OperatorTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const viewport = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < viewport.left || item.right > viewport.right) {
      nav.scrollLeft +=
        item.left - viewport.left - (nav.clientWidth - item.width) / 2;
    }
  }, [pathname, contestId]);
  const generalSession = useSessionStore((state) => state.generalSession);
  const staffSession = staffSessionFromGeneralSession(generalSession);
  const token = staffSession?.accessToken;
  const canViewParticipants = Boolean(
    contestId &&
    hasContestPermission(generalSession, contestId, 'contest.participant.view'),
  );
  const dashboardQuery = useQuery({
    enabled: Boolean(contestId && token && canViewParticipants),
    queryKey: ['operator', 'dashboard', contestId ?? null, 'tab-count', token],
    queryFn: () => getOperatorContestDashboard(contestId!, token!),
    refetchInterval: 15_000,
  });
  const noticesQuery = useQuery({
    enabled: Boolean(
      contestId &&
      token &&
      hasContestPermission(generalSession, contestId, 'contest.notice.view'),
    ),
    queryKey: ['operator', 'notices', contestId ?? null, 'tab-count', token],
    queryFn: () => listOperatorContestNotices(contestId!, token!),
    refetchInterval: 15_000,
  });
  const questionsQuery = useQuery({
    enabled: Boolean(
      contestId &&
      token &&
      hasContestPermission(
        generalSession,
        contestId,
        'contest.board.question.view',
      ),
    ),
    queryKey: ['operator', 'boards', contestId ?? null, 'tab-count', token],
    queryFn: () => listOperatorContestQuestions(contestId!, token!),
    refetchInterval: 15_000,
  });
  const problemsQuery = useQuery({
    enabled: Boolean(
      contestId &&
      token &&
      hasContestPermission(generalSession, contestId, 'contest.problem.view'),
    ),
    queryKey: ['operator', 'problems', contestId ?? null, 'tab-count', token],
    queryFn: () => getOperatorProblems(contestId!, token!),
    refetchInterval: 15_000,
  });

  if (!contestId) return null;
  const roleTitle = staffSession
    ? contestRoleTitleForAccount(staffSession.staff, contestId)
    : null;
  const basePath = `/operator/contests/${contestId}`;
  const questions = questionsQuery.data ?? [];
  const notices = noticesQuery.data ?? [];
  const problems = problemsQuery.data ?? [];
  const participantCountLabel = countLabel(
    dashboardQuery.data?.participant_count ?? 0,
    '팀',
  );
  const noticeCountLabel = countLabel(notices.length);
  const problemCountLabel = countLabel(problems.length, '개');
  const boardCountLabel =
    questions.length > 0
      ? `${questions.length}건(답변필요:${questions.filter((question) => !hasOperatorAnswer(question)).length})`
      : '';

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {staffSession ? (
          <p className="zoj-break-anywhere text-sm font-medium text-slate-700">
            {staffSession.staff.display_name}
            {roleTitle ? (
              <span className="text-slate-500"> / {roleTitle}</span>
            ) : null}
          </p>
        ) : null}
        {hasParticipantPreviewAccess(generalSession, contestId) ? (
          <Link
            to={participantPreviewPath(contestId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            참가자 화면 미리보기 <InterfaceIcon name="arrowUpRight" />
          </Link>
        ) : null}
      </div>
      <nav
        ref={navRef}
        aria-label="운영자 메뉴"
        className="zoj-management-tabs flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5"
      >
        {operatorTabs
          .filter((tab) =>
            hasContestPermission(generalSession, contestId, tab.permission),
          )
          .map((tab) => {
            const Icon = tab.icon;
            const to = tab.path ? `${basePath}/${tab.path}` : basePath;

            return (
              <NavLink
                className={({ isActive }) =>
                  [
                    'zoj-pressable inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition',
                    'shrink-0 whitespace-nowrap',
                    isActive
                      ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')
                }
                end={'end' in tab ? tab.end : undefined}
                key={tab.label}
                to={to}
              >
                <Icon />
                {tab.label}
                {tab.path === 'notices' && noticeCountLabel ? (
                  <TabCountBadge>{noticeCountLabel}</TabCountBadge>
                ) : null}
                {tab.path === 'board' && boardCountLabel ? (
                  <TabCountBadge>{boardCountLabel}</TabCountBadge>
                ) : null}
                {tab.path === 'participants' && participantCountLabel ? (
                  <TabCountBadge>{participantCountLabel}</TabCountBadge>
                ) : null}
                {tab.path === 'problems' && problemCountLabel ? (
                  <TabCountBadge>{problemCountLabel}</TabCountBadge>
                ) : null}
              </NavLink>
            );
          })}
      </nav>
    </div>
  );
}

function TabCountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100/80 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

export function OperatorPanel(props: OperatorPanelProps) {
  return <ManagementPanel {...props} />;
}

export function OperatorMetricCard({
  description,
  icon,
  label,
  tone = 'indigo',
  value,
}: OperatorMetricCardProps) {
  return (
    <article className="zoj-card flex items-start gap-4 sm:grid">
      <span
        className={[
          'inline-flex size-9 items-center justify-center rounded-lg border',
          toneClassNames[tone],
        ].join(' ')}
      >
        {icon}
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <strong className="text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
          {value}
        </strong>
        {description ? (
          <p className="text-sm leading-6 font-normal text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function DashboardIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M3.5 4.5a1 1 0 0 1 1-1h4v5h-5v-4ZM11.5 3.5h4a1 1 0 0 1 1 1v2h-5v-3ZM3.5 11.5h5v5h-4a1 1 0 0 1-1-1v-4ZM11.5 9.5h5v6a1 1 0 0 1-1 1h-4v-7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function GuideBookIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M10 5C7.5 3.5 4 3.5 2.5 4.5v12C5 15.5 7.5 15.5 10 17c2.5-1.5 5-1.5 7.5-.5v-12C16 3.5 12.5 3.5 10 5Zm0 0v12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M7.75 3.5 7.2 5.25a5.8 5.8 0 0 0-1.05.62L4.35 5.5 2.85 8.1l1.25 1.38a5.91 5.91 0 0 0 0 1.04L2.85 11.9l1.5 2.6 1.8-.37c.32.24.68.45 1.05.62l.55 1.75h3l.55-1.75c.37-.17.73-.38 1.05-.62l1.8.37 1.5-2.6-1.25-1.38a5.91 5.91 0 0 0 0-1.04l1.25-1.38-1.5-2.6-1.8.37a5.8 5.8 0 0 0-1.05-.62l-.55-1.75h-3ZM9.25 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function NoticeIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M4 12.5V7.75A3.75 3.75 0 0 1 7.75 4h4.5A3.75 3.75 0 0 1 16 7.75v4.75l1.25 2H2.75l1.25-2ZM8.25 16.5h3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function TeamIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M7.5 9.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM12.5 8.75a2.25 2.25 0 1 0 0-4.5M2.75 16.25a4.75 4.75 0 0 1 9.5 0M11.75 13.25a4 4 0 0 1 5.5 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function ProblemIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M5 4.5h10M5 8h10M5 11.5h6M5 15h4M3.5 2.75h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function JudgeIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M6.5 14.5h7M8 17h4M10 2.5v3M5.5 6.5 4 5M14.5 6.5 16 5M5.5 10a4.5 4.5 0 1 1 9 0c0 1.8-.92 2.72-1.72 3.52-.48.48-.91.91-1.03 1.48h-3.5c-.12-.57-.55-1-1.03-1.48C6.42 12.72 5.5 11.8 5.5 10Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function ScoreboardIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M4.5 15.5v-6M10 15.5v-11M15.5 15.5v-8M3 16.5h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
