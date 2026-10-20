import {
  usePresentationSession,
  presentationPath,
} from '@/domains/presentationAccess/session';
import { type ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isServiceMaster } from '@/domains/identityAccess/permissions';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import type { GeneralSession } from '@/domains/identityAccess/types';
import type { ParticipantSession } from '@/domains/teamParticipation/types';
import { appRoutes } from '@/routes/routeConfig';
import RouteErrorBoundary from '@/routes/RouteErrorBoundary';
import PageNotice from '@/shared/ui/PageNotice';

function operatorContestRoute(pathname: string) {
  const match = pathname.match(/^\/operator\/contests\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;
  return {
    contestId: decodeURIComponent(match[1]),
    section: match[2] ?? '',
  };
}

function participantRedirectPath(
  pathname: string,
  generalSession: GeneralSession | null,
  participantSession: ParticipantSession | null,
) {
  const operatorRoute = operatorContestRoute(pathname);
  if (!operatorRoute) return '/';

  const canParticipate =
    participantSession?.contestId === operatorRoute.contestId ||
    generalSession?.participantContests.some(
      (entry) => entry.contest.contest_id === operatorRoute.contestId,
    );
  if (!canParticipate) return '/';

  const sectionPath: Record<string, string> = {
    board: 'board',
    notices: 'board',
    problems: 'problems',
    scoreboard: 'scoreboard',
    submissions: 'submissions',
  };
  const nextSection = sectionPath[operatorRoute.section];
  const contestPath = encodeURIComponent(operatorRoute.contestId);
  return nextSection
    ? `/contests/${contestPath}/${nextSection}`
    : `/contests/${contestPath}`;
}

function RouteAccessGuard({
  access,
  children,
}: {
  access?: 'public' | 'admin' | 'operator';
  children: ReactNode;
}) {
  const location = useLocation();
  const generalSession = useSessionStore((state) => state.generalSession);
  const participantSession = useSessionStore(
    (state) => state.participantSession,
  );

  const displaySession = usePresentationSession((state) => state.session);
  if (
    displaySession &&
    location.pathname !== presentationPath(displaySession.contest_id)
  ) {
    return (
      <Navigate replace to={presentationPath(displaySession.contest_id)} />
    );
  }

  if (!access || access === 'public') return children;

  const canUseOperatorArea =
    Boolean(generalSession?.operatorSession) ||
    Boolean(generalSession?.operatorContests.length) ||
    Boolean(generalSession && isServiceMaster(generalSession));

  if (!generalSession) {
    if (access === 'operator' && participantSession) {
      return (
        <Navigate
          replace
          to={participantRedirectPath(
            location.pathname,
            null,
            participantSession,
          )}
        />
      );
    }
    const next = `${location.pathname}${location.search}`;

    return (
      <Navigate replace to={`/login?moveTo=${encodeURIComponent(next)}`} />
    );
  }

  if (!canUseOperatorArea) {
    return (
      <Navigate
        replace
        to={
          access === 'operator'
            ? participantRedirectPath(
                location.pathname,
                generalSession,
                participantSession,
              )
            : '/'
        }
      />
    );
  }

  if (access === 'admin' && !isServiceMaster(generalSession)) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-14">
        <PageNotice
          message="서비스 관리자 권한이 필요한 페이지입니다."
          status="error"
        />
      </section>
    );
  }

  return children;
}

export default function AppRoutes() {
  const location = useLocation();
  const routeResetKey = `${location.pathname}${location.search}${location.hash}:${location.key}`;

  return (
    <RouteErrorBoundary resetKey={routeResetKey}>
      <Suspense
        fallback={
          <section className="mx-auto w-full max-w-4xl px-6 py-14">
            <PageNotice
              message="페이지를 불러오는 중입니다."
              status="loading"
            />
          </section>
        }
      >
        <Routes>
          {appRoutes.map(({ access, path, Component }) => (
            <Route
              element={
                <RouteAccessGuard access={access}>
                  <Component />
                </RouteAccessGuard>
              }
              key={path}
              path={path}
            />
          ))}
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
