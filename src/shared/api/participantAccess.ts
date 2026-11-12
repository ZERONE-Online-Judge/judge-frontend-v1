import {
  type ApiClientError,
  isParticipantAccessBlockedError,
} from '@/shared/api/errors';

export const PARTICIPANT_ACCESS_BLOCKED_EVENT =
  'zoj:participant-access-blocked';

export type ParticipantAccessBlockedEventDetail = {
  contestId: string;
  error: ApiClientError;
};

/** Inform an already-open contest without changing the account's login. */
export function reportParticipantAccessBlocked(
  path: string,
  error: ApiClientError,
) {
  if (!isParticipantAccessBlockedError(error) || typeof window === 'undefined')
    return;
  const contestId = path.match(/\/contests\/([^/]+)/)?.[1];
  if (!contestId) return;
  window.dispatchEvent(
    new CustomEvent<ParticipantAccessBlockedEventDetail>(
      PARTICIPANT_ACCESS_BLOCKED_EVENT,
      { detail: { contestId: decodeURIComponent(contestId), error } },
    ),
  );
}
