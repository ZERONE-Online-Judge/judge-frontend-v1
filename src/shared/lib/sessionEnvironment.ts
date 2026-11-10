export type SessionEnvironmentData = {
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  label: string;
};

export type SessionDescription = {
  scope: 'general' | 'staff' | 'participant';
  issued_at: string;
  last_seen_at: string | null;
  expires_at: string;
  environment?: SessionEnvironmentData | null;
  contest_id?: string;
};

function knownText(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() !== 'unknown'
    ? value.trim()
    : '';
}

export function sessionEnvironmentLabel(
  environment?: SessionEnvironmentData | null,
) {
  const label = knownText(environment?.label);
  if (label) return label;
  const parts = [
    knownText(environment?.browser),
    knownText(environment?.os),
    environment?.device === 'mobile'
      ? '모바일'
      : environment?.device === 'tablet'
        ? '태블릿'
        : '',
  ].filter(Boolean);
  return parts.join(' · ') || '환경 정보 없음';
}

/** Conflict details are untyped API error data; never read the viewer's UA. */
export function readSessionDescriptions(value: unknown): SessionDescription[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      !['general', 'staff', 'participant'].includes(String(record.scope)) ||
      typeof record.issued_at !== 'string' ||
      typeof record.expires_at !== 'string'
    )
      return [];
    const data = record.environment;
    let environment: SessionEnvironmentData | null = null;
    if (data && typeof data === 'object') {
      const fields = data as Record<string, unknown>;
      environment = {
        browser:
          typeof fields.browser === 'string' ? fields.browser : 'Unknown',
        os: typeof fields.os === 'string' ? fields.os : 'Unknown',
        device: ['desktop', 'mobile', 'tablet'].includes(String(fields.device))
          ? (fields.device as SessionEnvironmentData['device'])
          : 'unknown',
        label: typeof fields.label === 'string' ? fields.label : '',
      };
    }
    return [
      {
        scope: record.scope as SessionDescription['scope'],
        issued_at: record.issued_at,
        last_seen_at:
          typeof record.last_seen_at === 'string' ? record.last_seen_at : null,
        expires_at: record.expires_at,
        environment,
        ...(typeof record.contest_id === 'string'
          ? { contest_id: record.contest_id }
          : {}),
      },
    ];
  });
}
