import { lazy, type ElementType } from 'react';
import { routeText } from '@/data/uiText';

const AdminContestsPage = lazy(() => import('@/pages/admin/AdminContestsPage'));
const AdminNoticesPage = lazy(() => import('@/pages/admin/AdminNoticesPage'));
const AdminHomePage = lazy(() => import('@/pages/admin/AdminHomePage'));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage'));
const AdminAuditLogsPage = lazy(
  () => import('@/pages/admin/AdminAuditLogsPage'),
);
const AdminInquiriesPage = lazy(
  () => import('@/pages/admin/AdminInquiriesPage'),
);
const AdminAnalyticsPage = lazy(
  () => import('@/pages/admin/AdminAnalyticsPage'),
);
const AdminJudgePage = lazy(() => import('@/pages/admin/AdminJudgePage'));
const ContestBoardPage = lazy(() => import('@/pages/contest/ContestBoardPage'));
const ContestOverviewPage = lazy(
  () => import('@/pages/contest/ContestOverviewPage'),
);
const ContestProblemDetailPage = lazy(
  () => import('@/pages/contest/ContestProblemDetailPage'),
);
const ContestProblemsPage = lazy(
  () => import('@/pages/contest/ContestProblemsPage'),
);
const ContestScoreboardPage = lazy(
  () => import('@/pages/contest/ContestScoreboardPage'),
);
const ContestSubmissionsPage = lazy(
  () => import('@/pages/contest/ContestSubmissionsPage'),
);
const ContestsPage = lazy(() => import('@/pages/public/ContestsPage'));
const AboutPage = lazy(() => import('@/pages/public/AboutPage'));
const EditorAboutPage = lazy(() => import('@/pages/public/EditorAboutPage'));
const JudgeStatusPage = lazy(() => import('@/pages/public/JudgeStatusPage'));
const PresentationPage = lazy(
  () => import('@/pages/presentation/PresentationPage'),
);
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const MainPage = lazy(() => import('@/pages/main/MainPage'));
const NotFoundPage = lazy(() => import('@/pages/public/NotFoundPage'));
const NoticesPage = lazy(() => import('@/pages/public/NoticesPage'));
const OperatorBoardPage = lazy(
  () => import('@/pages/operator/OperatorBoardPage'),
);
const OperatorAuditLogsPage = lazy(
  () => import('@/pages/operator/OperatorAuditLogsPage'),
);
const OperatorHomePage = lazy(
  () => import('@/pages/operator/OperatorHomePage'),
);
const OperatorNoticesPage = lazy(
  () => import('@/pages/operator/OperatorNoticesPage'),
);
const OperatorParticipantsPage = lazy(
  () => import('@/pages/operator/OperatorParticipantsPage'),
);
const OperatorProblemsPage = lazy(
  () => import('@/pages/operator/OperatorProblemsPage'),
);
const OperatorProblemReviewPage = lazy(
  () => import('@/pages/operator/OperatorProblemReviewPage'),
);
const OperatorScoreboardPage = lazy(
  () => import('@/pages/operator/OperatorScoreboardPage'),
);
const OperatorScoreboardPresentationPage = lazy(
  () => import('@/pages/operator/OperatorScoreboardPresentationPage'),
);
const OperatorSettingsPage = lazy(
  () => import('@/pages/operator/OperatorSettingsPage'),
);
const OperatorGuidePage = lazy(
  () => import('@/pages/operator/OperatorGuidePage'),
);
const OperatorOperatorsPage = lazy(
  () => import('@/pages/operator/OperatorOperatorsPage'),
);
const OperatorSubmissionsPage = lazy(
  () => import('@/pages/operator/OperatorSubmissionsPage'),
);
const SupportGuidePage = lazy(() => import('@/pages/public/SupportGuidePage'));

export type AppRoute = {
  access?: 'public' | 'admin' | 'operator';
  name: string;
  path: string;
  Component: ElementType;
  showInNavigation?: boolean;
  navigationBadge?: string;
};

export const appRoutes: readonly AppRoute[] = [
  {
    access: 'admin',
    name: '사용자 관리',
    path: '/admin/users',
    Component: AdminUsersPage,
    showInNavigation: false,
  },
  {
    name: routeText.home,
    path: '/',
    Component: MainPage,
  },
  {
    name: 'ZOJ 소개',
    path: '/about',
    Component: AboutPage,
  },
  {
    name: 'Editor 소개',
    path: '/editor',
    Component: EditorAboutPage,
    navigationBadge: 'NEW',
  },
  {
    name: routeText.contests,
    path: '/contests',
    Component: ContestsPage,
  },
  {
    name: routeText.contestDetail,
    path: '/contests/:contestId',
    Component: ContestOverviewPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestProblems,
    path: '/contests/:contestId/problems',
    Component: ContestProblemsPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestProblem,
    path: '/contests/:contestId/problems/:problemId',
    Component: ContestProblemDetailPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestProblemDetail,
    path: '/contests/:contestId/problems/:problemId/:problemView',
    Component: ContestProblemDetailPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestSubmissions,
    path: '/contests/:contestId/submissions',
    Component: ContestSubmissionsPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestScoreboard,
    path: '/contests/:contestId/scoreboard',
    Component: ContestScoreboardPage,
    showInNavigation: false,
  },
  {
    name: routeText.contestBoard,
    path: '/contests/:contestId/board',
    Component: ContestBoardPage,
    showInNavigation: false,
  },
  {
    name: routeText.notices,
    path: '/notices',
    Component: NoticesPage,
  },
  {
    name: routeText.notices,
    path: '/notices/:noticeId',
    Component: NoticesPage,
    showInNavigation: false,
  },
  {
    name: routeText.judgeStatus,
    path: '/judge-status',
    Component: JudgeStatusPage,
  },
  {
    name: routeText.support,
    path: '/support',
    Component: SupportGuidePage,
  },
  ...['rules', 'help', 'privacy', 'contact'].map((section) => ({
    name: routeText.support,
    path: `/support/${section}`,
    Component: SupportGuidePage,
    showInNavigation: false,
  })),
  {
    name: routeText.login,
    path: '/login',
    Component: LoginPage,
    showInNavigation: false,
  },
  {
    access: 'admin',
    name: routeText.admin,
    path: '/admin',
    Component: AdminHomePage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operator,
    path: '/operator',
    Component: OperatorHomePage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorContest,
    path: '/operator/contests/:contestId',
    Component: OperatorHomePage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorSettings,
    path: '/operator/contests/:contestId/settings',
    Component: OperatorSettingsPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: '운영 가이드',
    path: '/operator/contests/:contestId/guide',
    Component: OperatorGuidePage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorOperators,
    path: '/operator/contests/:contestId/operators',
    Component: OperatorOperatorsPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorNotices,
    path: '/operator/contests/:contestId/notices',
    Component: OperatorNoticesPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorBoard,
    path: '/operator/contests/:contestId/board',
    Component: OperatorBoardPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorParticipants,
    path: '/operator/contests/:contestId/participants',
    Component: OperatorParticipantsPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorProblems,
    path: '/operator/contests/:contestId/problems',
    Component: OperatorProblemsPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorProblemReview,
    path: '/operator/contests/:contestId/problem-review',
    Component: OperatorProblemReviewPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorSubmissions,
    path: '/operator/contests/:contestId/submissions',
    Component: OperatorSubmissionsPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorScoreboard,
    path: '/operator/contests/:contestId/scoreboard',
    Component: OperatorScoreboardPage,
    showInNavigation: false,
  },
  {
    access: 'public',
    name: '대회 프레젠테이션',
    path: '/presentation/contests/:contestId',
    Component: PresentationPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorScoreboard,
    path: '/operator/contests/:contestId/scoreboard/presentation',
    Component: OperatorScoreboardPresentationPage,
    showInNavigation: false,
  },
  {
    access: 'operator',
    name: routeText.operatorAuditLogs,
    path: '/operator/contests/:contestId/audit-logs',
    Component: OperatorAuditLogsPage,
    showInNavigation: false,
  },
  ...['/admin/notices', '/admin/notices/new'].map((path) => ({
    access: 'admin' as const,
    name: '서비스 공지',
    path,
    Component: AdminNoticesPage,
    showInNavigation: false,
  })),
  {
    access: 'admin',
    name: routeText.adminContests,
    path: '/admin/contests',
    Component: AdminContestsPage,
    showInNavigation: false,
  },
  {
    access: 'admin',
    name: routeText.adminJudge,
    path: '/admin/judge',
    Component: AdminJudgePage,
    showInNavigation: false,
  },
  {
    access: 'admin',
    name: '운영 통계',
    path: '/admin/analytics',
    Component: AdminAnalyticsPage,
    showInNavigation: false,
  },
  {
    access: 'admin',
    name: routeText.adminAuditLogs,
    path: '/admin/audit-logs',
    Component: AdminAuditLogsPage,
    showInNavigation: false,
  },
  {
    access: 'admin',
    name: '문의',
    path: '/admin/inquiries',
    Component: AdminInquiriesPage,
    showInNavigation: false,
  },
  {
    name: routeText.notFound,
    path: '*',
    Component: NotFoundPage,
    showInNavigation: false,
  },
];

export const navigationRoutes = appRoutes.filter(
  (route) =>
    route.path !== '/' &&
    !('showInNavigation' in route && route.showInNavigation === false),
);
