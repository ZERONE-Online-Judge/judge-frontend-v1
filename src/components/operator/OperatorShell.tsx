import { hasOperatorAnswer } from '@/domains/serviceCommunication/boardPresentation';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import {
  hasParticipantPreviewAccess,
  participantPreviewPath,
} from '@/domains/identityAccess/participantPreview';
import { useEffect, useId, useState, type ReactNode } from 'react';
import ModalDialog from '@/shared/ui/ModalDialog';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { ManagementPanel } from '@/components/common/ManagementCards';
import { accessText, operatorNavText } from '@/data/uiText';
import { contestRoleTitleForAccount } from '@/domains/identityAccess/contestRoles';
import {
  hasContestPermission,
  hasContestAccess,
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

const SIDEBAR_COLLAPSED_KEY = 'zoj.operator.sidebarCollapsed';

function storedSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

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

  const needsProblemStatus = Boolean(
    contestId &&
    hasContestAccess(generalSession, contestId) &&
    (Array.isArray(permission)
      ? permission.includes('contest.problem.view')
      : permission === 'contest.problem.view') &&
    !hasContestPermission(generalSession, contestId, permission),
  );
  const contestQuery = useQuery({
    enabled: needsProblemStatus && Boolean(staffSession?.accessToken),
    queryKey: [
      'operator',
      'dashboard',
      contestId ?? null,
      'read-access',
      staffSession?.accessToken,
    ],
    queryFn: () =>
      getOperatorContestDashboard(contestId!, staffSession!.accessToken),
    refetchInterval: 15_000,
  });

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
    !hasContestPermission(
      generalSession,
      contestId,
      permission,
      contestQuery.data?.contest?.status,
    )
  ) {
    if (needsProblemStatus && contestQuery.isPending)
      return (
        <PageLayout variant="management" title="문제 모아보기">
          <p role="status">대회 상태를 확인하고 있습니다.</p>
        </PageLayout>
      );
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
  const { pathname, key: locationKey } = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    storedSidebarCollapsed,
  );
  const menuId = useId();
  const menuOpen = openedAt === locationKey;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1200px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpenedAt(null);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  const generalSession = useSessionStore((state) => state.generalSession);
  const staffSession = staffSessionFromGeneralSession(generalSession);
  const token = staffSession?.accessToken;
  const dashboardQuery = useQuery({
    enabled: Boolean(
      contestId && token && hasContestAccess(generalSession, contestId),
    ),
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
      ? `${questions.length} · 미답변 ${questions.filter((question) => !hasOperatorAnswer(question)).length}`
      : '';

  const visibleTabs = operatorTabs.filter((tab) =>
    hasContestPermission(
      generalSession,
      contestId,
      tab.permission,
      dashboardQuery.data?.contest?.status,
    ),
  );
  const activeTab = visibleTabs.find((tab) =>
    tab.path
      ? pathname.startsWith(`${basePath}/${tab.path}`)
      : pathname === basePath,
  );
  function tabLink(tab: (typeof visibleTabs)[number]) {
    const Icon = tab.icon;
    const to = tab.path ? `${basePath}/${tab.path}` : basePath;
    const count =
      tab.path === 'notices'
        ? noticeCountLabel
        : tab.path === 'board'
          ? boardCountLabel
          : tab.path === 'participants'
            ? participantCountLabel
            : tab.path === 'problems'
              ? problemCountLabel
              : '';
    return (
      <NavLink
        className="operator-menu__link"
        aria-label={count ? `${tab.label} ${count}` : tab.label}
        title={count ? `${tab.label} · ${count}` : tab.label}
        end={'end' in tab ? tab.end : undefined}
        key={tab.label}
        to={to}
        onClick={() => setOpenedAt(null)}
      >
        <Icon />
        <span className="operator-menu__label">{tab.label}</span>
        {count ? <TabCountBadge>{count}</TabCountBadge> : null}
      </NavLink>
    );
  }
  function menuLinks() {
    return (
      <>
        {visibleTabs.filter((tab) => !tab.path).map(tabLink)}
        {hasParticipantPreviewAccess(generalSession, contestId!) ? (
          <Link
            to={participantPreviewPath(contestId!)}
            target="_blank"
            rel="noopener noreferrer"
            className="operator-menu__link operator-menu__preview"
            aria-label="참가자 화면 미리보기"
            title="참가자 화면 미리보기 · 새 탭에서 열기"
            onClick={() => setOpenedAt(null)}
          >
            <InterfaceIcon name="search" />
            <span className="operator-menu__label">참가자 화면 미리보기</span>
            <InterfaceIcon
              name="arrowUpRight"
              className="operator-menu__external"
            />
          </Link>
        ) : null}
        {visibleTabs.filter((tab) => tab.path).map(tabLink)}
      </>
    );
  }

  function contestContext(inDrawer = false) {
    return (
      <div className="operator-context">
        <div className="operator-context__toolbar">
          <Link
            to="/contests"
            className="operator-context__back"
            aria-label="대회 목록"
            title="대회 목록"
            onClick={() => setOpenedAt(null)}
          >
            <InterfaceIcon name="arrowLeft" />
            <span>대회 목록</span>
          </Link>
          {!inDrawer ? (
            <button
              type="button"
              className="operator-sidebar-toggle"
              aria-label={
                sidebarCollapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'
              }
              title={
                sidebarCollapsed ? '사이드 메뉴 펼치기' : '사이드 메뉴 접기'
              }
              aria-expanded={!sidebarCollapsed}
              aria-controls={`${menuId}-desktop`}
              onClick={() => {
                const next = !sidebarCollapsed;
                setSidebarCollapsed(next);
                try {
                  window.localStorage.setItem(
                    SIDEBAR_COLLAPSED_KEY,
                    String(next),
                  );
                } catch {
                  // The menu remains usable when browser storage is unavailable.
                }
              }}
            >
              <InterfaceIcon name="menu" />
            </button>
          ) : null}
        </div>
        <strong
          className="operator-context__title"
          title={dashboardQuery.data?.contest?.title}
        >
          {dashboardQuery.data?.contest?.title ?? '대회 운영'}
        </strong>
        {staffSession ? (
          <p className="operator-context__identity">
            {staffSession.staff.display_name}
            <span>{roleTitle}</span>
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="operator-navigation"
      data-open={menuOpen}
      data-collapsed={sidebarCollapsed}
    >
      <div className="operator-desktop-context">{contestContext()}</div>
      <button
        type="button"
        className="operator-menu-trigger"
        aria-expanded={menuOpen}
        aria-label="운영자 메뉴 열기"
        aria-controls={menuOpen ? menuId : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpenedAt(locationKey)}
      >
        <span className="operator-menu-trigger__icon">
          <InterfaceIcon name="menu" />
        </span>
        <span className="operator-menu-trigger__copy">
          <strong>운영 메뉴 열기</strong>
          <span>현재 화면 · {activeTab?.label ?? '대회 운영'}</span>
        </span>
        <InterfaceIcon
          name="arrowRight"
          className="operator-menu-trigger__cue"
        />
      </button>
      <div className="operator-menu-collapse" id={`${menuId}-desktop`}>
        <div className="operator-menu-collapse__inner">
          <nav aria-label="운영자 메뉴" className="operator-menu">
            {menuLinks()}
          </nav>
        </div>
      </div>
      {menuOpen ? (
        <ModalDialog
          className="operator-menu-drawer"
          title="운영자 메뉴"
          onClose={() => setOpenedAt(null)}
          closeLabel="운영자 메뉴 닫기"
          drawer
        >
          {contestContext(true)}
          <nav id={menuId} aria-label="운영자 메뉴" className="operator-menu">
            {menuLinks()}
          </nav>
        </ModalDialog>
      ) : null}
    </div>
  );
}

function TabCountBadge({ children }: { children: ReactNode }) {
  return <span className="operator-menu__count">{children}</span>;
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
    <article className="zoj-card operator-metric">
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
