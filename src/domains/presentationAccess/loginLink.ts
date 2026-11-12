import { SITE_ORIGIN } from '@/shared/seo/metadata';
import { presentationPath } from '@/domains/presentationAccess/session';

export type PresentationLoginLink = {
  contestId: string;
  email: string;
  divisionIds: string[];
};

const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
const account = /^[a-z0-9._+-]{1,64}@score\.zoj\.kr$/;

export function parsePresentationLoginLink(
  search: string,
  hash: string,
): PresentationLoginLink | null {
  if (search.length > 4096 || hash.length > 4096) return null;
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const contestIds = query.getAll('contestId');
  const accounts = fragment.getAll('account');
  const divisionIds = [...new Set(query.getAll('divisionId'))];
  const email = accounts[0]?.trim().toLowerCase() ?? '';
  if (
    contestIds.length !== 1 ||
    !identifier.test(contestIds[0]) ||
    accounts.length !== 1 ||
    fragment.size !== 1 ||
    !account.test(email) ||
    divisionIds.length > 64 ||
    divisionIds.some((id) => !identifier.test(id))
  )
    return null;
  return { contestId: contestIds[0], email, divisionIds };
}

export function presentationLoginUrl(
  contestId: string,
  email: string,
  divisionIds: string[] = [],
) {
  const query = new URLSearchParams({ contestId });
  [...new Set(divisionIds)].forEach((id) => query.append('divisionId', id));
  // A fragment stays out of HTTP requests, referrers and server access logs.
  const fragment = new URLSearchParams({ account: email.trim().toLowerCase() });
  if (!parsePresentationLoginLink(query.toString(), fragment.toString()))
    throw new TypeError('Invalid presentation login link');
  return `${SITE_ORIGIN}/presentation/login?${query}#${fragment}`;
}

export function targetPresentationPath(link: PresentationLoginLink) {
  const query = new URLSearchParams();
  link.divisionIds.forEach((id) => query.append('divisionId', id));
  return `${presentationPath(link.contestId)}${query.size ? `?${query}` : ''}`;
}
