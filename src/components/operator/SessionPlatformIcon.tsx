import type { ReactNode } from 'react';
import type { SessionEnvironmentData } from '@/shared/lib/sessionEnvironment';

const icons: Record<string, { label: string; shape: ReactNode }> = {
  ios: {
    label: 'iOS',
    shape: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 5h4m-3 14h2" />
      </>
    ),
  },
  android: {
    label: 'Android',
    shape: (
      <>
        <path d="m7 5-2-3m12 3 2-3M4 12a8 8 0 0 1 16 0v6H4Zm4 6v4m8-4v4M1 12v5m22-5v5" />
        <path d="M8 9h.01M16 9h.01" strokeWidth="3" />
      </>
    ),
  },
  windows: {
    label: 'Windows PC',
    shape: <path d="m3 5 18-3v20L3 19Zm8-1v16M3 12h18" />,
  },
  macos: {
    label: 'macOS',
    shape: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 22h8m-4-5v5M8 8h.01M16 8h.01m-8 3c2 2 6 2 8 0" />
      </>
    ),
  },
  linux: {
    label: 'Linux',
    shape: (
      <>
        <path d="M7 9V7a5 5 0 0 1 10 0v2c0 4 3 5 3 9 0 2-3 3-8 3s-8-1-8-3c0-4 3-5 3-9Z" />
        <path d="M9 7h.01M15 7h.01m-5 3 2 2 2-2m-5 6c0 3 6 3 6 0M3 22l4-2m14 2-4-2" />
      </>
    ),
  },
  pc: {
    label: 'PC',
    shape: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 22h8m-4-5v5" />
      </>
    ),
  },
  unknown: {
    label: '기기 정보 없음',
    shape: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="M10 9a2 2 0 1 1 3 1.73c-1 .6-1 1-1 2.27m0 3h.01" />
      </>
    ),
  },
};

export default function SessionPlatformIcon({
  environment,
}: {
  environment?: SessionEnvironmentData | null;
}) {
  const os = environment?.os?.trim().toLowerCase();
  const key =
    os === 'ipados' ? 'ios' : os === 'chromeos' ? 'pc' : os || 'unknown';
  const icon = icons[key] ?? icons.unknown;
  return (
    <svg
      className="participant-session-platform"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={icon.label}
      focusable="false"
    >
      <title>{icon.label}</title>
      {icon.shape}
    </svg>
  );
}
