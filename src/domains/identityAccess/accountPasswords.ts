import { apiRequest } from '@/shared/api/client';
import {
  mapGeneralSession,
  saveGeneralSession,
} from '@/domains/identityAccess/sessionStorage';
import type { GeneralSessionApi } from './types';

export function getAccountPassword(token: string) {
  return apiRequest<{ has_password: boolean }>('/auth/general/password', token);
}
export function getLoginOptions(email: string) {
  return apiRequest<{
    password_available: boolean;
    passkey_available: boolean;
  }>('/auth/general/login-options', undefined, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
export function requestAccountPassword(token?: string, email?: string) {
  return apiRequest<{ cooldown_seconds: number; valid_seconds: number }>(
    email
      ? '/auth/general/password/reset/request'
      : '/auth/general/password/request',
    token,
    { method: 'POST', body: JSON.stringify(email ? { email } : {}) },
  );
}
export function confirmAccountPassword(
  code: string,
  password: string,
  token?: string,
  email?: string,
) {
  return apiRequest<{ changed: boolean; sessions_revoked: boolean }>(
    email
      ? '/auth/general/password/reset/confirm'
      : '/auth/general/password/confirm',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        otp_code: code,
        new_password: password,
        ...(email ? { email } : {}),
      }),
    },
  );
}
export async function loginGeneralPassword(
  email: string,
  password: string,
  forceNewSession = false,
) {
  const data = await apiRequest<GeneralSessionApi>(
    '/auth/general/password/login',
    undefined,
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        force_new_session: forceNewSession,
      }),
    },
  );
  const session = mapGeneralSession(data);
  saveGeneralSession(session);
  return session;
}
