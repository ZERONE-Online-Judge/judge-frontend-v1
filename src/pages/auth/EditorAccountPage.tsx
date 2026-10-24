import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PasskeyDialog from '@/components/auth/PasskeyDialog';
import AccountPasswordDialog from '@/components/auth/AccountPasswordDialog';
import { apiRequest } from '@/shared/api/client';
import { isSessionAuthError } from '@/shared/api/errors';
import { mapGeneralSession } from '@/domains/identityAccess/sessionStorage';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import type {
  GeneralSession,
  GeneralSessionApi,
} from '@/domains/identityAccess/types';
import { safeEditorPath } from '@/shared/lib/editorAuthRedirect';

export default function EditorAccountPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<GeneralSession | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const returnPath =
    '/editor/return?' +
    new URLSearchParams({ next: safeEditorPath(params.get('next')) });
  const section =
    params.get('section') === 'password' ? 'password' : 'passkeys';
  useEffect(() => {
    let active = true;
    apiRequest<GeneralSessionApi>('/auth/general/sso', undefined, {
      method: 'POST',
      body: '{}',
    })
      .then((data) => {
        if (!active) return;
        const current = mapGeneralSession(data);
        useSessionStore.getState().setGeneralSession(current);
        setSession(current);
      })
      .catch((error) => {
        if (!active) return;
        if (isSessionAuthError(error))
          navigate(
            '/login?' +
              new URLSearchParams({
                moveTo: location.pathname + location.search,
              }),
            { replace: true },
          );
        else setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [retry, location.pathname, location.search, navigate]);
  return (
    <section className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">ZOJ 계정 보안</h1>
      <p className="my-4">에디터와 ZOJ에서 같은 계정과 패스키를 사용합니다.</p>
      {failed ? (
        <div role="alert">
          <p>계정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          <button
            onClick={() => {
              setFailed(false);
              setRetry((value) => value + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      ) : !session ? (
        <p role="status">계정을 확인하고 있습니다.</p>
      ) : section === 'passkeys' ? (
        <PasskeyDialog
          token={session.accessToken}
          email={session.account.email}
          onClose={() => navigate(returnPath, { replace: true })}
        />
      ) : (
        <AccountPasswordDialog
          token={session.accessToken}
          email={session.account.email}
          mode="set"
          onClose={() => navigate(returnPath, { replace: true })}
          onDone={() => {
            useSessionStore.getState().clearSessions();
            navigate(
              '/login?' +
                new URLSearchParams({
                  password: 'changed',
                  moveTo: returnPath,
                }),
              { replace: true },
            );
          }}
        />
      )}
    </section>
  );
}
