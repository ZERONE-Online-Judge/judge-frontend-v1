import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginPresentation } from '@/domains/presentationAccess/api';
import {
  parsePresentationLoginLink,
  targetPresentationPath,
  type PresentationLoginLink,
} from '@/domains/presentationAccess/loginLink';
import {
  usePresentationSession,
  type PresentationSession,
} from '@/domains/presentationAccess/session';
import { isApiClientError } from '@/shared/api/errors';
import { ModalButton } from '@/shared/ui/ModalDialog';
import PageNotice from '@/shared/ui/PageNotice';

type LoginFailure = { message: string; retryAt: number };

function loginFailure(error: unknown): LoginFailure {
  if (isApiClientError(error) && error.status === 429) {
    const seconds = Number(error.details?.retry_after_seconds);
    return {
      message: '연결 요청이 많습니다. 잠시 후 다시 연결해 주세요.',
      retryAt:
        Date.now() +
        (Number.isFinite(seconds) ? Math.min(3600, Math.max(1, seconds)) : 60) *
          1000,
    };
  }
  if (
    isApiClientError(error) &&
    (error.status === 401 || error.code === 'invalid_presentation_account')
  )
    return {
      message:
        '링크가 만료되었거나 사용 중지되었습니다. 운영자에게 새 링크를 받아 주세요.',
      retryAt: 0,
    };
  // Never echo a raw server/network error that might contain the login alias.
  return {
    message: '연결하지 못했습니다. 네트워크를 확인하고 다시 연결해 주세요.',
    retryAt: 0,
  };
}

export default function PresentationLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const link = useMemo(
    () => parsePresentationLoginLink(location.search, location.hash),
    [location.search, location.hash],
  );
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{
    link: PresentationLoginLink;
    attempt: number;
    value: LoginFailure;
  } | null>(null);
  const [now, setNow] = useState(Date.now);
  const request = useRef<{
    link: PresentationLoginLink;
    attempt: number;
    promise: Promise<PresentationSession>;
  } | null>(null);

  useLayoutEffect(() => {
    // Remove even malformed credentials before starting any authentication.
    // Keep the parsed link only in component memory, never router/storage state.
    if (
      window.location.pathname === location.pathname &&
      window.location.search === location.search &&
      window.location.hash === location.hash &&
      location.hash
    )
      window.history.replaceState(
        window.history.state,
        '',
        `${location.pathname}${location.search}`,
      );
    if (!link) return;
    let active = true;
    if (request.current?.link !== link || request.current.attempt !== attempt) {
      // Clear only this tab's old display token. Other operator/participant
      // tabs retain their normal login when a presentation link is opened.
      usePresentationSession.getState().setSession(null);
      request.current = {
        link,
        attempt,
        promise: Promise.resolve().then(() => loginPresentation(link.email)),
      };
    }
    void request.current.promise
      .then((session) => {
        if (!active) return;
        if (
          session?.contest_id !== link.contestId ||
          typeof session.access_token !== 'string' ||
          !session.access_token.trim() ||
          !Number.isFinite(Date.parse(session.expires_at)) ||
          Date.parse(session.expires_at) <= Date.now()
        )
          throw new Error('Invalid presentation session');
        usePresentationSession.getState().setSession(session);
        navigate(targetPresentationPath(link), { replace: true });
      })
      .catch((error: unknown) => {
        if (active) setFailure({ link, attempt, value: loginFailure(error) });
      });
    return () => {
      active = false;
    };
  }, [
    link,
    attempt,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ]);

  const currentFailure =
    failure?.link === link && failure.attempt === attempt
      ? failure.value
      : null;
  const waitSeconds = currentFailure
    ? Math.max(0, Math.ceil((currentFailure.retryAt - now) / 1000))
    : 0;
  useLayoutEffect(() => {
    if (!currentFailure?.retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [currentFailure]);

  return (
    <section className="grid min-h-dvh place-items-center bg-slate-950 px-5 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <p className="mb-3 text-sm font-semibold text-violet-600">ZOJ</p>
        <h1 className="mb-3 text-2xl font-bold">프레젠테이션 연결</h1>
        <p className="mb-6 text-sm leading-6 text-slate-500">
          전용 계정으로 로그인하고 발표 화면을 엽니다.
        </p>
        <PageNotice
          status={!link || currentFailure ? 'error' : 'loading'}
          message={
            !link
              ? '자동 로그인 링크가 올바르지 않습니다. 운영자에게 링크를 다시 받아 주세요.'
              : (currentFailure?.message ?? '프레젠테이션을 연결하고 있습니다.')
          }
        />
        {(!link || currentFailure) && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {link && (
              <ModalButton
                tone="primary"
                disabled={waitSeconds > 0}
                onClick={() => setAttempt((value) => value + 1)}
              >
                {waitSeconds > 0
                  ? `${waitSeconds}초 후 다시 연결`
                  : '다시 연결'}
              </ModalButton>
            )}
            <Link
              className="px-2 py-2 text-sm font-medium text-slate-600 underline underline-offset-4"
              to="/login?reason=presentation"
              onClick={() => usePresentationSession.getState().setSession(null)}
            >
              계정 주소로 로그인
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
