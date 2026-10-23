import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { apiRequest } from '@/shared/api/client';
import { mapGeneralSession, saveGeneralSession } from './sessionStorage';
import type { GeneralSessionApi } from './types';

export function supportsPasskeys() {
  return window.isSecureContext && browserSupportsWebAuthn();
}
export type AccountPasskey = {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
};
export function getPasskeys(token: string) {
  return apiRequest<{ recently_verified: boolean; passkeys: AccountPasskey[] }>(
    '/auth/general/passkeys',
    token,
  );
}
export async function registerPasskey(token: string, name: string) {
  const data = await apiRequest<{
    challenge_id: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>('/auth/general/passkeys/register/options', token, { method: 'POST' });
  const credential = await startRegistration({ optionsJSON: data.options });
  return apiRequest('/auth/general/passkeys/register/verify', token, {
    method: 'POST',
    body: JSON.stringify({ challenge_id: data.challenge_id, credential, name }),
  });
}
export async function loginPasskey(email: string, forceNewSession = false) {
  const data = await apiRequest<{
    challenge_id: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>('/auth/general/passkeys/login/options', undefined, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const credential = await startAuthentication({ optionsJSON: data.options });
  const result = await apiRequest<GeneralSessionApi>(
    '/auth/general/passkeys/login/verify',
    undefined,
    {
      method: 'POST',
      body: JSON.stringify({
        challenge_id: data.challenge_id,
        credential,
        force_new_session: forceNewSession,
      }),
    },
  );
  const session = mapGeneralSession(result);
  saveGeneralSession(session);
  return session;
}
export function removePasskey(token: string, id: string) {
  return apiRequest('/auth/general/passkeys/remove', token, {
    method: 'POST',
    body: JSON.stringify({ credential_id: id }),
  });
}
export function requestSecurityCode(token: string) {
  return apiRequest<{ challenge_id: string; cooldown_seconds: number }>(
    '/auth/general/security/otp/request',
    token,
    { method: 'POST' },
  );
}
export function verifySecurityCode(
  token: string,
  challengeId: string,
  code: string,
) {
  return apiRequest('/auth/general/security/otp/verify', token, {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challengeId, code }),
  });
}
export function passkeyError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const code = 'code' in error ? error.code : '';
  const cause = error.cause;
  const causeName = cause instanceof Error ? cause.name : '';
  if (
    error.name === 'NotAllowedError' ||
    causeName === 'NotAllowedError' ||
    code === 'ERROR_CEREMONY_ABORTED'
  ) {
    return '패스키 인증을 취소했거나 시간이 초과되었습니다. 다시 시도하거나 이메일 인증을 이용해 주세요.';
  }
  if (
    error.name === 'InvalidStateError' ||
    code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
  ) {
    return '이 기기에 이미 등록한 패스키입니다. 기존 패스키로 로그인해 주세요.';
  }
  if (typeof code === 'string' && code.startsWith('ERROR_AUTHENTICATOR_')) {
    return '이 기기에서 패스키 인증을 진행할 수 없습니다. 다른 기기나 이메일 인증을 이용해 주세요.';
  }
  return null;
}
