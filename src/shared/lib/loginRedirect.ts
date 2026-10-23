export function safeLoginRedirectTarget(value: string | null) {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (
    value.includes('\\') ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return null;
  try {
    const target = new URL(value, 'https://zoj.invalid');
    if (target.origin !== 'https://zoj.invalid') return null;
    const pathname = decodeURIComponent(target.pathname);
    if (
      pathname.startsWith('//') ||
      pathname.includes('\\') ||
      pathname.toLowerCase().startsWith('/login')
    )
      return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function contestLoginPath(contestId: string, nextPath?: string) {
  const search = new URLSearchParams({
    contestId,
  });
  const safeNext = safeLoginRedirectTarget(
    nextPath ?? `/contests/${encodeURIComponent(contestId)}`,
  );
  if (safeNext) search.set('moveTo', safeNext);

  return `/login?${search.toString()}`;
}

export function readLoginRedirectTarget(searchParams: URLSearchParams) {
  return (
    safeLoginRedirectTarget(searchParams.get('moveTo')) ??
    safeLoginRedirectTarget(searchParams.get('next'))
  );
}
