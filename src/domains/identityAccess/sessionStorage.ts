import type {
  GeneralSession,
  GeneralSessionApi,
  StaffSession,
  StaffSessionApi,
} from '@/domains/identityAccess/types';
import type { ParticipantSession } from '@/domains/teamParticipation/types';

export const PARTICIPANT_SESSION_KEY = 'zoj.participantSession';
export const PARTICIPANT_PREVIEW_SESSION_KEY = 'zoj.participantPreviewSession';
export const PARTICIPANT_PREVIEW_MODE_KEY = 'zoj.participantPreviewMode';
export const GENERAL_SESSION_KEY = 'zoj.generalSession';
export const SESSION_SYNC_EVENT = 'zoj:session-sync';
export const SESSION_EXPIRED_EVENT = 'zoj:session-expired';
export const SESSION_EXPIRED_STORAGE_KEY = 'zoj.sessionExpired';

export type SessionExpiredEventDetail = {
  currentPath?: string;
  requestPath?: string;
};

export function expireStoredAccountSession(token: string, requestPath: string) {
  const general = loadStoredGeneralSession();
  const participant = loadStoredParticipantSession();
  if (general?.accessToken !== token && participant?.accessToken !== token)
    return false;

  // Notify other tabs before removing the shared credentials. A stale response
  // cannot sign out a newer login because its token no longer matches storage.
  browserStorage()?.setItem(
    SESSION_EXPIRED_STORAGE_KEY,
    JSON.stringify({
      email: general?.account.email ?? participant?.member.email,
      at: Date.now(),
      requestPath,
    }),
  );
  saveGeneralSession(null);
  saveParticipantSession(null);
  emitSessionSync();
  window.dispatchEvent(
    new CustomEvent<SessionExpiredEventDetail>(SESSION_EXPIRED_EVENT, {
      detail: {
        currentPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        requestPath,
      },
    }),
  );
  return true;
}

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function legacyBrowserStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function readStoredSessionValue(key: string) {
  const storage = browserStorage();
  if (!storage) return null;

  const current = storage.getItem(key);
  if (current) return current;

  const legacyStorage = legacyBrowserStorage();
  const legacy = legacyStorage?.getItem(key) ?? null;
  if (!legacy) return null;

  storage.setItem(key, legacy);
  legacyStorage?.removeItem(key);

  return legacy;
}

function removeStoredSessionValue(key: string) {
  browserStorage()?.removeItem(key);
  legacyBrowserStorage()?.removeItem(key);
}

export function emitSessionSync() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_SYNC_EVENT));
  }
}

export function loadStoredParticipantSession(): ParticipantSession | null {
  const storage = browserStorage();
  if (!storage) return null;

  try {
    const previewRaw = legacyBrowserStorage()?.getItem(
      PARTICIPANT_PREVIEW_SESSION_KEY,
    );
    const preview = previewRaw
      ? (JSON.parse(previewRaw) as ParticipantSession)
      : null;
    if (
      preview?.isPreview &&
      preview.member.email === loadStoredGeneralSession()?.account.email
    ) {
      return preview;
    }
  } catch {
    legacyBrowserStorage()?.removeItem(PARTICIPANT_PREVIEW_SESSION_KEY);
  }

  try {
    const raw = readStoredSessionValue(PARTICIPANT_SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as ParticipantSession) : null;
    // Old shared previews must not put another tab into participant mode.
    return session?.isPreview ? null : session;
  } catch {
    removeStoredSessionValue(PARTICIPANT_SESSION_KEY);
    return null;
  }
}

export function saveParticipantSession(session: ParticipantSession | null) {
  const storage = browserStorage();
  if (!storage) return;

  if (session?.isPreview) {
    legacyBrowserStorage()?.setItem(
      PARTICIPANT_PREVIEW_SESSION_KEY,
      JSON.stringify(session),
    );
    return;
  }
  legacyBrowserStorage()?.removeItem(PARTICIPANT_PREVIEW_SESSION_KEY);
  legacyBrowserStorage()?.removeItem(PARTICIPANT_PREVIEW_MODE_KEY);

  if (session) {
    storage.setItem(PARTICIPANT_SESSION_KEY, JSON.stringify(session));
    legacyBrowserStorage()?.removeItem(PARTICIPANT_SESSION_KEY);
  } else {
    removeStoredSessionValue(PARTICIPANT_SESSION_KEY);
  }
}

export function mapStaffSession(data: StaffSessionApi): StaffSession {
  const staff = data?.staff;
  if (
    !staff ||
    typeof staff.email !== 'string' ||
    typeof staff.display_name !== 'string' ||
    typeof staff.is_service_master !== 'boolean'
  ) {
    throw new Error('invalid staff session payload');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    staff: {
      email: staff.email,
      display_name: staff.display_name,
      is_service_master: staff.is_service_master,
      contest_scopes: staff.contest_scopes ?? {},
      contest_roles: staff.contest_roles,
      protected_master_contests: staff.protected_master_contests,
    },
    defaultRedirect: data.default_redirect,
  };
}

export function isValidStaffSession(session: unknown): session is StaffSession {
  const candidate = session as Partial<StaffSession> | null;

  return Boolean(
    candidate &&
    typeof candidate.accessToken === 'string' &&
    candidate.staff &&
    typeof candidate.staff.email === 'string' &&
    typeof candidate.staff.display_name === 'string' &&
    typeof candidate.staff.is_service_master === 'boolean',
  );
}

export function mapGeneralSession(
  data: GeneralSessionApi,
  previous?: GeneralSession | null,
): GeneralSession {
  return {
    accessToken: data.access_token ?? previous?.accessToken ?? '',
    refreshToken: data.refresh_token ?? previous?.refreshToken ?? '',
    account: data.account,
    participantContests: data.participant_contests ?? [],
    operatorContests: data.operator_contests ?? [],
    operatorSession: data.operator_session
      ? mapStaffSession(data.operator_session)
      : data.operator_session === null
        ? null
        : (previous?.operatorSession ?? null),
  };
}

export function loadStoredGeneralSession(): GeneralSession | null {
  const storage = browserStorage();
  if (!storage) return null;

  try {
    const raw = readStoredSessionValue(GENERAL_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GeneralSession>;
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.account) {
      removeStoredSessionValue(GENERAL_SESSION_KEY);
      return null;
    }

    let operatorSession: StaffSession | null | undefined =
      parsed.operatorSession ?? null;
    if (operatorSession && !isValidStaffSession(operatorSession)) {
      operatorSession = null;
    }
    if (operatorSession) {
      operatorSession = {
        accessToken: operatorSession.accessToken,
        defaultRedirect: operatorSession.defaultRedirect,
        refreshToken: operatorSession.refreshToken,
        staff: operatorSession.staff,
      };
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      account: parsed.account,
      participantContests: parsed.participantContests ?? [],
      operatorContests: parsed.operatorContests ?? [],
      operatorSession,
    } as GeneralSession;
  } catch {
    removeStoredSessionValue(GENERAL_SESSION_KEY);
    return null;
  }
}

export function saveGeneralSession(session: GeneralSession | null) {
  const storage = browserStorage();
  if (!storage) return;

  if (session) {
    storage.setItem(GENERAL_SESSION_KEY, JSON.stringify(session));
    legacyBrowserStorage()?.removeItem(GENERAL_SESSION_KEY);
  } else {
    removeStoredSessionValue(GENERAL_SESSION_KEY);
  }
}
