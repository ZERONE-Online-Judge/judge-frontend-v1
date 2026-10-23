import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, isPasskeyCeremonyActive } from '@/shared/api/client';
import { isSessionAuthError } from '@/shared/api/errors';
import { mapGeneralSession } from './sessionStorage';
import { useSessionStore } from './sessionStore';
import type { GeneralSessionApi } from './types';

// Restore on arrival/focus. Anonymous visitors do not continuously poll auth.
export function useSharedLogin() {
  const client = useQueryClient();
  const setSession = useSessionStore((s) => s.setGeneralSession);
  useEffect(() => {
    let active = true,
      pending = false;
    async function restore() {
      if (!active || pending || document.hidden || isPasskeyCeremonyActive())
        return;
      const before = useSessionStore.getState().generalSession;
      pending = true;
      try {
        const data = await apiRequest<GeneralSessionApi>(
          '/auth/general/sso',
          undefined,
          {
            method: 'POST',
            body: JSON.stringify(
              before?.refreshToken
                ? { refresh_token: before.refreshToken }
                : {},
            ),
          },
        );
        const current = useSessionStore.getState().generalSession;
        const session = mapGeneralSession(data);
        // A concurrent API retry may already have saved this shared response.
        // Still finish account-switch cache cleanup in that case.
        const alreadyApplied =
          current?.accessToken === session.accessToken &&
          current.account.email === session.account.email;
        if (
          !active ||
          (current?.accessToken !== before?.accessToken && !alreadyApplied)
        )
          return;
        if (before && before.account.email !== session.account.email) {
          await client.cancelQueries();
          if (
            !active ||
            useSessionStore.getState().generalSession?.accessToken !==
              current?.accessToken
          )
            return;
          client.clear();
          useSessionStore.getState().clearSessions();
        }
        setSession(session);
      } catch (error) {
        if (
          active &&
          isSessionAuthError(error) &&
          useSessionStore.getState().generalSession?.accessToken ===
            before?.accessToken &&
          before
        ) {
          await client.cancelQueries();
          if (
            !active ||
            useSessionStore.getState().generalSession?.accessToken !==
              before.accessToken
          )
            return;
          client.clear();
          useSessionStore.getState().clearSessions();
        }
      } finally {
        pending = false;
      }
    }
    void restore();
    window.addEventListener('focus', restore);
    document.addEventListener('visibilitychange', restore);
    return () => {
      active = false;
      window.removeEventListener('focus', restore);
      document.removeEventListener('visibilitychange', restore);
    };
  }, [client, setSession]);
}
