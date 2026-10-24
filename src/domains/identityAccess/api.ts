import {
  loadStoredGeneralSession,
  mapGeneralSession,
  mapStaffSession,
  saveGeneralSession,
} from '@/domains/identityAccess/sessionStorage';
import type {
  GeneralLoginMethod,
  GeneralSession,
  GeneralSessionApi,
  OtpRequestResponse,
  StaffSession,
  StaffSessionApi,
} from '@/domains/identityAccess/types';
import { apiRequest } from '@/shared/api/client';

export async function detectGeneralLoginMethod(email: string) {
  return apiRequest<GeneralLoginMethod>('/auth/general/login-method', undefined, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function requestGeneralOtp(
  email: string,
  editorOnboarding = false,
) {
  const path = editorOnboarding
    ? '/auth/general/editor/otp/request'
    : '/auth/general/otp/request';
  return apiRequest<OtpRequestResponse>(path, undefined, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyGeneralOtp(
  email: string,
  otpCode: string,
  previous?: GeneralSession | null,
  forceNewSession = false,
) {
  const data = await apiRequest<GeneralSessionApi>('/auth/general/otp/verify', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email,
      force_new_session: forceNewSession,
      otp_code: otpCode,
    }),
  });
  const session = mapGeneralSession(data, previous);
  saveGeneralSession(session);
  return session;
}

export async function requestGeneralPasswordOtp(email: string, password: string) {
  return apiRequest<OtpRequestResponse>('/auth/general/password/otp/request', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyGeneralPasswordOtp(
  email: string,
  password: string,
  otpCode: string,
  previous?: GeneralSession | null,
) {
  const data = await apiRequest<GeneralSessionApi>('/auth/general/password/otp/verify', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password, otp_code: otpCode }),
  });
  const session = mapGeneralSession(data, previous);
  saveGeneralSession(session);
  return session;
}

export async function getGeneralMe(token: string, previous?: GeneralSession | null) {
  const data = await apiRequest<GeneralSessionApi>('/auth/general/me', token);
  const session = mapGeneralSession(
    data,
    loadStoredGeneralSession() ?? previous,
  );
  return session;
}

export async function refreshGeneralSession(refreshToken?: string, previous?: GeneralSession | null) {
  const data = await apiRequest<GeneralSessionApi>('/auth/general/refresh', undefined, {
    method: 'POST',
    ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
  });
  const session = mapGeneralSession(data, previous);
  saveGeneralSession(session);
  return session;
}

export async function logoutGeneral(token: string, refreshToken?: string) {
  return apiRequest<{ revoked: boolean }>('/auth/general/logout', token, {
    method: 'POST',
    ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
  });
}

export async function loginStaffWithPassword(email: string, password: string) {
  const data = await apiRequest<StaffSessionApi>('/auth/staff/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return mapStaffSession(data);
}

export async function requestStaffOtp(email: string) {
  return apiRequest<OtpRequestResponse>('/auth/staff/otp/request', undefined, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyStaffOtp(email: string, otpCode: string) {
  const data = await apiRequest<StaffSessionApi>('/auth/staff/otp/verify', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, otp_code: otpCode }),
  });
  return mapStaffSession(data);
}

export async function getStaffMe(token: string) {
  const data = await apiRequest<StaffSessionApi['staff']>('/auth/staff/me', token);
  return data;
}

export async function refreshStaffSession(refreshToken?: string): Promise<StaffSession> {
  const data = await apiRequest<StaffSessionApi>('/auth/staff/refresh', undefined, {
    method: 'POST',
    ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
  });
  return mapStaffSession(data);
}

export async function logoutStaff(token: string, refreshToken?: string) {
  return apiRequest<{ revoked: boolean }>('/auth/staff/logout', token, {
    method: 'POST',
    ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
  });
}
