import { apiFetchRaw, apiRequest } from '@/shared/api/client';
import { toApiError } from '@/shared/api/errors';
import type { OperatorPresentationScoreboardResponse } from '@/domains/submissionScoreboard/types';
import type { PresentationSession } from './session';
import { presentationApiQuery } from '@/domains/submissionScoreboard/presentationOptions';

export type PresentationAccount = {
  email: string;
  created_at: string;
  expires_at: string;
  active: boolean;
};
const accountPath = (contestId: string) =>
  `/operator/contests/${encodeURIComponent(contestId)}/scoreboard/presentation-account`;
export function getPresentationAccount(contestId: string, token: string) {
  return apiRequest<PresentationAccount | null>(accountPath(contestId), token);
}
export function issuePresentationAccount(contestId: string, token: string) {
  return apiRequest<PresentationAccount>(accountPath(contestId), token, {
    method: 'PUT',
  });
}
export function revokePresentationAccount(contestId: string, token: string) {
  return apiRequest<{ revoked: boolean }>(accountPath(contestId), token, {
    method: 'DELETE',
  });
}
// These tokens must never use the general/participant token substitution or refresh path.
async function displayRequest<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  const { response, payload } = await apiFetchRaw(path, token, init);
  if (!response.ok) throw toApiError(response, payload);
  return (payload as { data: T }).data;
}
export function loginPresentation(email: string) {
  return displayRequest<PresentationSession>(
    '/auth/presentation/login',
    undefined,
    {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  );
}
export function getPresentationScoreboard(
  contestId: string,
  token: string,
  divisionIds?: string[],
) {
  return displayRequest<OperatorPresentationScoreboardResponse>(
    `/presentation/contests/${encodeURIComponent(contestId)}/scoreboard${presentationApiQuery(divisionIds)}`,
    token,
  );
}
