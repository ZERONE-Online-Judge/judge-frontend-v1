import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import ParticipantPreviewShell from '@/components/contest/ParticipantPreviewShell';
import {
  activateParticipantPreview,
  isParticipantPreviewMode,
} from '@/domains/identityAccess/participantPreview';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import type { ReactNode } from 'react';
import ContestEmergencyNotice from '@/components/contest/ContestEmergencyNotice';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import ContestAccessDeniedModal from '@/components/contest/ContestAccessDeniedModal';
import { getPublicContest } from '@/domains/contestAdministration/api';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
} from '@/domains/contestAdministration/logic';
import type { PublicContestDetail } from '@/domains/contestAdministration/types';
import { contestQueryKeys } from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import PageNotice from '@/shared/ui/PageNotice';
import { contestLoginPath } from '@/shared/lib/loginRedirect';
import { isApiClientError } from '@/shared/api/errors';

type ContestPageShellProps = {
  children: (detail: PublicContestDetail) => ReactNode;
};

export default function ContestPageShell({ children }: ContestPageShellProps) {
  const { contestId } = useParams();
  const { search } = useLocation();
  const session = useSessionStore((state) => state.generalSession);
  const preview = Boolean(
    contestId && isParticipantPreviewMode(session, contestId, search),
  );
  useEffect(() => {
    if (preview && session && contestId)
      activateParticipantPreview(session, contestId);
  }, [preview, session, contestId]);
  if (contestId && session && preview) {
    return (
      <ParticipantPreviewShell
        contestId={contestId}
        session={session}
        key={`${contestId}:${session.account.email}`}
      >
        {children}
      </ParticipantPreviewShell>
    );
  }
  return <StandardContestPageShell>{children}</StandardContestPageShell>;
}

function StandardContestPageShell({ children }: ContestPageShellProps) {
  const { contestId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedContestId = contestId ?? '';
  const isOverview =
    location.pathname.replace(/\/$/, '') ===
    `/contests/${encodeURIComponent(resolvedContestId)}`;
  const [checkedParticipantAccessKey, setCheckedParticipantAccessKey] =
    useState('');
  const {
    activeParticipantSession,
    ensureParticipantSession,
    generalSession,
    participantContest,
    token,
  } = useContestParticipantSession(resolvedContestId);
  const contestQuery = useQuery({
    enabled: Boolean(contestId),
    queryKey: [
      ...contestQueryKeys.publicContest(contestId),
      tokenQueryIdentity(token),
    ],
    queryFn: () => getPublicContest(contestId!, token),
    retry: (attempt, error) =>
      !(isApiClientError(error) && [401, 403, 404].includes(error.status)) &&
      attempt < 2,
    refetchInterval: 15_000,
  });

  const detail = contestQuery.isError ? undefined : contestQuery.data;
  const contest = detail?.contest;
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const hasPublicAfterEndResource = contest
    ? (
        ['problem', 'scoreboard', 'submission', 'board', 'notice'] as const
      ).some((resource) =>
        canViewContestResource(
          contest,
          hasSessionAccess,
          contestResourceAccess(contest, resource),
        ),
      )
    : false;
  const isPublicLiveScoreboard = Boolean(
    contest &&
    location.pathname.replace(/\/$/, '') ===
      `/contests/${encodeURIComponent(resolvedContestId)}/scoreboard` &&
    contestAccessPhase(contest) === 'running' &&
    canViewContestResource(
      contest,
      false,
      contestResourceAccess(contest, 'scoreboard'),
    ),
  );
  const shouldRequireParticipantAccess =
    !isOverview &&
    !isPublicLiveScoreboard &&
    (!contest || contestAccessPhase(contest) !== 'ended');
  const hasContestParticipantAccess =
    isOverview ||
    !generalSession ||
    Boolean(activeParticipantSession) ||
    Boolean(participantContest) ||
    isPublicLiveScoreboard ||
    (!shouldRequireParticipantAccess && hasPublicAfterEndResource);
  const shouldCheckParticipantAccess = Boolean(
    contestId &&
    generalSession &&
    (isOverview || shouldRequireParticipantAccess),
  );
  const participantAccessCheckKey = [
    contestId ?? 'no-contest',
    generalSession?.account.email ?? 'public',
    isOverview
      ? 'overview'
      : shouldRequireParticipantAccess
        ? 'required'
        : 'optional',
  ].join(':');
  const hasCheckedParticipantAccess =
    !shouldCheckParticipantAccess ||
    Boolean(participantContest || activeParticipantSession) ||
    checkedParticipantAccessKey === participantAccessCheckKey;
  const isCheckingParticipantAccess =
    shouldCheckParticipantAccess && !hasCheckedParticipantAccess;

  useEffect(() => {
    if (
      !contestId ||
      !generalSession ||
      !(isOverview || shouldRequireParticipantAccess)
    )
      return;
    if (participantContest || activeParticipantSession) return;
    if (checkedParticipantAccessKey === participantAccessCheckKey) return;

    let cancelled = false;
    const currentCheckKey = participantAccessCheckKey;

    async function checkParticipantAccess() {
      await ensureParticipantSession().catch(() => null);
      if (!cancelled) setCheckedParticipantAccessKey(currentCheckKey);
    }

    void checkParticipantAccess();

    return () => {
      cancelled = true;
    };
  }, [
    activeParticipantSession,
    checkedParticipantAccessKey,
    contestId,
    ensureParticipantSession,
    generalSession,
    isOverview,
    participantAccessCheckKey,
    participantContest,
    shouldRequireParticipantAccess,
  ]);

  if (!contestId) {
    return (
      <section className="zoj-contest-shell mx-auto grid w-full max-w-[112rem] min-w-0 gap-5 px-4 py-6 font-sans sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
        <PageNotice message="대회 정보를 찾을 수 없습니다." status="error" />
      </section>
    );
  }

  const accessError =
    isApiClientError(contestQuery.error) &&
    [401, 403, 404].includes(contestQuery.error.status);
  const section = location.pathname.split('/')[3];
  const resourceAccess = contest
    ? section === 'board'
      ? [
          contestResourceAccess(contest, 'notice'),
          contestResourceAccess(contest, 'board'),
        ]
      : section === 'problems'
        ? [contestResourceAccess(contest, 'problem')]
        : section === 'scoreboard'
          ? [contestResourceAccess(contest, 'scoreboard')]
          : section === 'submissions'
            ? [contestResourceAccess(contest, 'submission')]
            : []
    : [];
  const needsParticipantLogin =
    !isOverview &&
    contest &&
    (shouldRequireParticipantAccess ||
      (!resourceAccess.includes('public') &&
        resourceAccess.includes('participants')));
  if (
    !generalSession &&
    !activeParticipantSession &&
    (accessError || needsParticipantLogin)
  ) {
    return (
      <Navigate
        replace
        to={contestLoginPath(
          contestId,
          `${location.pathname}${location.search}${location.hash}`,
        )}
      />
    );
  }

  return (
    <section className="zoj-contest-shell mx-auto grid w-full max-w-[112rem] min-w-0 gap-5 px-4 py-6 font-sans sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {contestQuery.isLoading && (
        <PageNotice message="대회 정보를 불러오는 중입니다." status="loading" />
      )}
      {contestQuery.isError && (
        <div className="grid gap-3">
          <PageNotice
            message={
              accessError
                ? '대회를 찾을 수 없거나 현재 계정에 접근 권한이 없습니다. 참가자로 등록된 이메일인지 확인해 주세요.'
                : '대회 정보를 불러오지 못했습니다.'
            }
            status="error"
          />
          {accessError ? (
            <Link
              className="text-sm text-indigo-600 underline underline-offset-4"
              to="/contests"
            >
              대회 목록으로
            </Link>
          ) : null}
        </div>
      )}
      {detail && contest && isCheckingParticipantAccess ? (
        <PageNotice message="참가 권한을 확인하는 중입니다." status="loading" />
      ) : null}

      {detail &&
      contest &&
      !hasContestParticipantAccess &&
      !isCheckingParticipantAccess ? (
        <ContestAccessDeniedModal
          loginTo={
            contestId
              ? contestLoginPath(
                  contestId,
                  `${location.pathname}${location.search}${location.hash}`,
                )
              : undefined
          }
          onClose={() => navigate('/contests', { replace: true })}
        />
      ) : null}

      {detail &&
      contest &&
      hasContestParticipantAccess &&
      !isCheckingParticipantAccess ? (
        <>
          <ContestEmergencyNotice
            contestId={contestId}
            notice={contest.emergency_notice ?? ''}
            template={contest.emergency_notice_template}
            contest={contest}
          />

          {children(detail)}
        </>
      ) : null}
    </section>
  );
}
