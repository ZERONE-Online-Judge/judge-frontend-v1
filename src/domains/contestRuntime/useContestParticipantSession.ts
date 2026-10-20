import { isParticipantPreviewMode } from '@/domains/identityAccess/participantPreview';
import { useLocation } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { getGeneralMe } from '@/domains/identityAccess/api';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { useRefreshGeneralSession } from '@/domains/identityAccess/useRefreshGeneralSession';
import { createParticipantSessionFromGeneralToken } from '@/domains/teamParticipation/api';

const participantSessionRequests = new Map<
  string,
  ReturnType<typeof createParticipantSessionFromGeneralToken>
>();

export function useContestParticipantSession(contestId: string) {
  const { search } = useLocation();
  const generalSession = useSessionStore((state) => state.generalSession);
  const participantSession = useSessionStore(
    (state) => state.participantSession,
  );
  const setParticipantSession = useSessionStore(
    (state) => state.setParticipantSession,
  );
  const setGeneralSession = useSessionStore((state) => state.setGeneralSession);
  const isRefreshingGeneralSession = useRefreshGeneralSession();
  const participantContest = generalSession?.participantContests.find(
    (item) => item.contest.contest_id === contestId,
  );
  const canPreview = isParticipantPreviewMode(
    generalSession,
    contestId,
    search,
  );
  const matchingSession =
    participantSession?.contestId === contestId ? participantSession : null;
  const activeParticipantSession = useMemo(
    () =>
      matchingSession?.isPreview
        ? canPreview &&
          generalSession &&
          matchingSession.member.email === generalSession.account.email
          ? { ...matchingSession, accessToken: generalSession.accessToken }
          : null
        : matchingSession,
    [matchingSession, canPreview, generalSession],
  );
  const isPreview = activeParticipantSession?.isPreview === true;
  const divisionId =
    activeParticipantSession?.division.division_id ??
    participantContest?.division.division_id;
  const token =
    activeParticipantSession?.accessToken ?? generalSession?.accessToken;

  const ensureParticipantSession = useCallback(async () => {
    if (activeParticipantSession) return activeParticipantSession;
    if (!generalSession?.accessToken) return null;

    const latestGeneralSession =
      participantContest || isRefreshingGeneralSession
        ? generalSession
        : await getGeneralMe(generalSession.accessToken, generalSession).catch(
            () => generalSession,
          );
    const latestParticipantContest =
      latestGeneralSession.participantContests.find(
        (item) => item.contest.contest_id === contestId,
      );

    if (!latestParticipantContest) return null;
    if (latestGeneralSession !== generalSession) {
      setGeneralSession(latestGeneralSession);
    }

    const requestKey = `${contestId}:${latestGeneralSession.accessToken}`;
    let request = participantSessionRequests.get(requestKey);

    if (!request) {
      request = createParticipantSessionFromGeneralToken(
        contestId,
        latestGeneralSession.accessToken,
      ).finally(() => {
        participantSessionRequests.delete(requestKey);
      });
      participantSessionRequests.set(requestKey, request);
    }

    const session = await request;
    setParticipantSession(session);

    return session;
  }, [
    activeParticipantSession,
    contestId,
    generalSession,
    isRefreshingGeneralSession,
    participantContest,
    setGeneralSession,
    setParticipantSession,
  ]);

  return {
    activeParticipantSession,
    divisionId,
    ensureParticipantSession,
    generalSession,
    participantContest,
    participantSession,
    isRefreshingGeneralSession,
    isPreview,
    token,
  };
}
