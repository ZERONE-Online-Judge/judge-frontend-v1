import { hasContestPermission } from '@/domains/identityAccess/permissions';
import { PARTICIPANT_PREVIEW_MODE_KEY } from '@/domains/identityAccess/sessionStorage';
import type { GeneralSession } from '@/domains/identityAccess/types';

export function hasParticipantPreviewAccess(
  session: GeneralSession | null | undefined,
  contestId: string,
) {
  return hasContestPermission(
    session,
    contestId,
    'contest.participant.preview',
  );
}

export function participantPreviewPath(contestId: string) {
  return `/contests/${encodeURIComponent(contestId)}?preview=1`;
}

export function isParticipantPreviewMode(
  session: GeneralSession | null | undefined,
  contestId: string,
  search: string,
) {
  if (!session || !hasParticipantPreviewAccess(session, contestId))
    return false;
  if (new URLSearchParams(search).get('preview') === '1') return true;
  try {
    const mode = JSON.parse(
      window.sessionStorage.getItem(PARTICIPANT_PREVIEW_MODE_KEY) ?? 'null',
    );
    return (
      mode?.contestId === contestId && mode?.email === session.account.email
    );
  } catch {
    return false;
  }
}

export function activateParticipantPreview(
  session: GeneralSession,
  contestId: string,
) {
  try {
    window.sessionStorage.setItem(
      PARTICIPANT_PREVIEW_MODE_KEY,
      JSON.stringify({ contestId, email: session.account.email }),
    );
  } catch {
    // The explicit preview URL remains usable when tab storage is unavailable.
  }
}
