import type { ReactNode } from 'react';
import {
  sessionEnvironmentLabel,
  type SessionDescription,
  type SessionEnvironmentData,
} from '@/shared/lib/sessionEnvironment';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import SessionActivityTime from '@/shared/ui/SessionActivityTime';
import './SessionTransferDialog.css';

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function OutlineIcon({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function DeviceIcon({
  environment,
}: {
  environment?: SessionEnvironmentData | null;
}) {
  if (environment?.device === 'mobile' || environment?.device === 'tablet') {
    return (
      <OutlineIcon>
        <rect
          x={environment.device === 'tablet' ? 4 : 6}
          y="2"
          width={environment.device === 'tablet' ? 16 : 12}
          height="20"
          rx="3"
        />
        <path d="M10 5h4m-3 14h2" />
      </OutlineIcon>
    );
  }
  if (environment?.device === 'desktop') {
    return (
      <OutlineIcon>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 22h8m-4-5v5" />
      </OutlineIcon>
    );
  }
  return (
    <OutlineIcon>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M10 9a2 2 0 1 1 3 1.73c-1 .6-1 1-1 2.27m0 3h.01" />
    </OutlineIcon>
  );
}

function ActivityTime({ value }: { value?: string | null }) {
  return (
    <SessionActivityTime
      value={value}
      compact
      emptyText="활동 시간 정보 없음"
    />
  );
}

export default function SessionTransferDialog({
  sessions,
  activeSessionCount,
  lastSeenAt,
  pending,
  onCancel,
  onConfirm,
}: {
  sessions: SessionDescription[];
  activeSessionCount: number;
  lastSeenAt?: string | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const orderedSessions = [...sessions].sort((a, b) => {
    const moment = (session: SessionDescription) =>
      validDate(session.last_seen_at)?.getTime() ??
      validDate(session.issued_at)?.getTime() ??
      0;
    return moment(b) - moment(a);
  });
  const [primary, ...others] = orderedSessions;
  const count = Math.max(activeSessionCount, sessions.length, 1);
  // A top-level summary may belong to another session. Never pair it with a
  // different device when several sessions are present.
  const activity = validDate(primary?.last_seen_at)
    ? primary.last_seen_at
    : count === 1
      ? lastSeenAt
      : null;
  const unknownCount = Math.max(0, count - Math.max(sessions.length, 1));

  return (
    <ModalDialog
      className="session-transfer-modal"
      titleId="session-replacement-title"
      title="로그인을 여기로 옮길까요?"
      description="한 번에 하나의 기기에서 사용할 수 있습니다."
      onClose={pending ? undefined : onCancel}
      footer={
        <>
          <ModalButton disabled={pending} onClick={onCancel}>
            기존 로그인 유지
          </ModalButton>
          <ModalButton tone="primary" disabled={pending} onClick={onConfirm}>
            {pending ? '로그인 중…' : '여기서 로그인'}
            <OutlineIcon>
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </OutlineIcon>
          </ModalButton>
        </>
      }
    >
      <div
        className="session-transfer-route"
        aria-label="기존 로그인에서 이 브라우저로 이동"
      >
        <div className="session-transfer-device">
          <span className="session-transfer-icon">
            <DeviceIcon environment={primary?.environment} />
          </span>
          <span className="session-transfer-label">
            기존 로그인{count > 1 ? ` ${count}개` : ''}
          </span>
          <strong>{sessionEnvironmentLabel(primary?.environment)}</strong>
          <span className="session-transfer-outcome">
            {count > 1 ? '계속하면 모두 종료' : '계속하면 종료'}
          </span>
        </div>
        <OutlineIcon className="session-transfer-arrow">
          <path d="M5 12h14m-5-5 5 5-5 5" />
        </OutlineIcon>
        <div className="session-transfer-device session-transfer-device--current">
          <span className="session-transfer-icon">
            <OutlineIcon>
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 22h8m-4-5v5" />
            </OutlineIcon>
          </span>
          <span className="session-transfer-label">옮길 곳</span>
          <strong>이 브라우저</strong>
          <span className="session-transfer-outcome">새로 로그인</span>
        </div>
      </div>
      <div className="session-transfer-activity">
        <span>
          <OutlineIcon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </OutlineIcon>
          기존 기기 마지막 활동
        </span>
        <ActivityTime value={activity} />
      </div>
      {count > 1 ? (
        <details className="session-transfer-others">
          <summary>함께 종료될 다른 로그인 {count - 1}개</summary>
          {others.length ? (
            <ul>
              {others.map((session, index) => (
                <li key={`${session.scope}/${session.issued_at}/${index}`}>
                  <strong>
                    {sessionEnvironmentLabel(session.environment)}
                  </strong>
                  <span>
                    마지막 활동 <ActivityTime value={session.last_seen_at} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {unknownCount > 0 ? (
            <p>추가 로그인 {unknownCount}개의 환경 정보가 없습니다.</p>
          ) : null}
        </details>
      ) : null}
    </ModalDialog>
  );
}
