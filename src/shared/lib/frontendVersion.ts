export type FrontendVersion = {
  schemaVersion: 1;
  version: string;
  revision: string | null;
  builtAt: string;
  entry: string;
};

export function parseFrontendVersion(value: unknown): FrontendVersion | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<FrontendVersion>;
  if (
    item.schemaVersion !== 1 ||
    typeof item.version !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,160}$/.test(item.version) ||
    !(item.revision === null || typeof item.revision === 'string') ||
    typeof item.builtAt !== 'string' ||
    !Number.isFinite(Date.parse(item.builtAt)) ||
    typeof item.entry !== 'string' ||
    !/^\/assets\/[^/?#]+\.js$/.test(item.entry)
  )
    return null;
  return item as FrontendVersion;
}

/** Query nonce also bypasses intermediaries that ignore request cache directives. */
export async function fetchFrontendVersion(
  signal: AbortSignal,
): Promise<FrontendVersion | null> {
  const url = new URL('/version.json', window.location.origin);
  url.searchParams.set(
    '__zojVersionCheck',
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json')
  )
    return null;
  return parseFrontendVersion(await response.json());
}

/** Store before navigation. An unavailable store must never create a reload loop. */
export function claimFrontendReload(current: string, target: string): boolean {
  try {
    const key = `zoj.frontendReload:${current}:${target}`;
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function isPresentationUpdateDeferred(pathname: string) {
  return (
    /^\/presentation(?:\/|$)/i.test(pathname) ||
    /^\/operator\/contests\/[^/]+\/scoreboard\/presentation\/?$/i.test(pathname)
  );
}
