import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import { safeLoginRedirectTarget } from '@/shared/lib/loginRedirect';
import { getFrontendUpdateSafety } from '@/shared/lib/frontendUpdateSafety';
import { isPresentationUpdateDeferred } from '@/shared/lib/frontendVersion';
import { queryClient } from '@/shared/query/queryClient';

type RouteErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  isRecovering: boolean;
};

const CHUNK_RELOAD_STORAGE_PREFIX = 'zoj.routeChunkReload';
const CHUNK_RELOAD_RETRY_WINDOW_MS = 5 * 60 * 1000;

function isDynamicImportError(error: Error) {
  const message = String(error?.message ?? error);
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('ChunkLoadError')
  );
}

function chunkReloadStorageKey() {
  if (typeof window === 'undefined') return CHUNK_RELOAD_STORAGE_PREFIX;
  return `${CHUNK_RELOAD_STORAGE_PREFIX}:${window.location.pathname}`;
}

function shouldRetryChunkLoad() {
  if (typeof window === 'undefined') return false;
  const safety = getFrontendUpdateSafety();
  if (
    safety.drafts ||
    safety.operations ||
    queryClient.isMutating() ||
    isPresentationUpdateDeferred(window.location.pathname) ||
    document.fullscreenElement
  )
    return false;
  try {
    const key = chunkReloadStorageKey();
    const lastRetry = Number(window.sessionStorage.getItem(key) ?? '0');
    if (
      Number.isFinite(lastRetry) &&
      Date.now() - lastRetry < CHUNK_RELOAD_RETRY_WINDOW_MS
    ) {
      return false;
    }
    window.sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function reloadWithCacheBust() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('__zojChunkReload', String(Date.now()));
  window.location.replace(url.toString());
}

export default class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { hasError: false, isRecovering: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route render failed', error, errorInfo);
    if (isDynamicImportError(error) && shouldRetryChunkLoad()) {
      this.setState({ isRecovering: true });
      reloadWithCacheBust();
    }
  }

  componentDidUpdate(previousProps: RouteErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, isRecovering: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.state.isRecovering) {
      return (
        <PageLayout
          description="배포된 새 화면 파일을 다시 요청하고 있습니다. 잠시만 기다려 주세요."
          title="화면을 새로 불러오는 중입니다"
        >
          <div className="rounded border border-violet-100 bg-violet-50 px-5 py-4 text-sm font-bold text-violet-800">
            최신 화면으로 자동 전환 중입니다.
          </div>
        </PageLayout>
      );
    }

    const target = safeLoginRedirectTarget(
      typeof window === 'undefined'
        ? null
        : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    const loginPath = target
      ? `/login?reason=session&moveTo=${encodeURIComponent(target)}`
      : '/login?reason=session';

    return (
      <PageLayout
        description="로그인 세션이 끊겼거나 화면 상태를 복구하지 못했습니다. 다시 로그인하거나 홈으로 이동해 주세요."
        title="화면을 다시 불러오지 못했습니다"
      >
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded bg-violet-950 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800"
            reloadDocument
            to={loginPath}
          >
            다시 로그인
          </Link>
          <Link
            className="rounded border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            reloadDocument
            to="/"
          >
            홈으로 이동
          </Link>
        </div>
      </PageLayout>
    );
  }
}
