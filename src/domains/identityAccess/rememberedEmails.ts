import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isPresentationEmail } from '@/domains/presentationAccess/session';

export const REMEMBERED_EMAILS_KEY = 'zoj.login-emails.v1';
const MAX_EMAILS = 5;
const emailSchema = z.email();

type RememberedEmailState = {
  enabled: boolean;
  emails: string[];
};

function emptyState(): RememberedEmailState {
  return { enabled: false, emails: [] };
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string' || value.length > 320) return null;
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    isPresentationEmail(email) ||
    !emailSchema.safeParse(email).success
  ) {
    return null;
  }
  return email;
}

function parseState(value: string | null): RememberedEmailState {
  if (!value || value.length > 10_000) return emptyState();
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('enabled' in parsed) ||
      parsed.enabled !== true ||
      !('emails' in parsed) ||
      !Array.isArray(parsed.emails)
    ) {
      return emptyState();
    }
    const emails: string[] = [];
    for (const value of parsed.emails) {
      const email = normalizeEmail(value);
      if (email && !emails.includes(email)) emails.push(email);
      if (emails.length === MAX_EMAILS) break;
    }
    return { enabled: true, emails };
  } catch {
    return emptyState();
  }
}

function readState(fallback = emptyState()): RememberedEmailState {
  try {
    return parseState(window.localStorage.getItem(REMEMBERED_EMAILS_KEY));
  } catch {
    return fallback;
  }
}

function persistState(state: RememberedEmailState) {
  try {
    if (state.enabled) {
      window.localStorage.setItem(REMEMBERED_EMAILS_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAILS_KEY);
    }
  } catch {
    // A blocked or full browser store must never interrupt login.
  }
}

export function useRememberedEmails() {
  const [state, setState] = useState<RememberedEmailState>(() => readState());
  const stateRef = useRef(state);

  const update = useCallback((next: RememberedEmailState) => {
    stateRef.current = next;
    setState(next);
    persistState(next);
  }, []);

  useEffect(() => {
    function syncStorage(event: StorageEvent) {
      if (event.key !== REMEMBERED_EMAILS_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) {
          return;
        }
      } catch {
        return;
      }
      const next = parseState(event.key === null ? null : event.newValue);
      stateRef.current = next;
      setState(next);
    }
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
  }, []);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const latest = readState(stateRef.current);
      update({ enabled, emails: enabled ? latest.emails : [] });
    },
    [update],
  );

  const remember = useCallback(
    (value: string) => {
      // Re-read at completion so an opt-out in another tab also wins while
      // authentication is awaiting a server response.
      const latest = readState(stateRef.current);
      const email = normalizeEmail(value);
      if (!latest.enabled || !email) return;
      update({
        enabled: true,
        emails: [
          email,
          ...latest.emails.filter((item) => item !== email),
        ].slice(0, MAX_EMAILS),
      });
    },
    [update],
  );

  const remove = useCallback(
    (value: string) => {
      const latest = readState(stateRef.current);
      const email = normalizeEmail(value);
      update({
        enabled: latest.enabled,
        emails: latest.emails.filter((item) => item !== email),
      });
    },
    [update],
  );

  const clear = useCallback(() => {
    const latest = readState(stateRef.current);
    update({ enabled: latest.enabled, emails: [] });
  }, [update]);

  return {
    enabled: state.enabled,
    emails: state.emails,
    prefill: state.emails[0] ?? '',
    setEnabled,
    remember,
    remove,
    clear,
  };
}
