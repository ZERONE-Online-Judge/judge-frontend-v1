import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getAccountPassword } from '@/domains/identityAccess/accountPasswords';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import AccountPasswordDialog from './AccountPasswordDialog';
import './PasswordSetupGuidance.css';

function AccountGuidance({ email, token }: { email: string; token: string }) {
  const [missingPassword, setMissingPassword] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const clearSessions = useSessionStore((state) => state.clearSessions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (dismissed) return;
    let active = true;
    void getAccountPassword(token)
      .then((result) => {
        if (active) setMissingPassword(result.has_password === false);
      })
      .catch(() => {
        // A failed status check must not imply that a password is missing.
      });
    return () => {
      active = false;
    };
  }, [token, dismissed]);

  return (
    <>
      {missingPassword && !dismissed && (
        <section
          className="password-setup-guidance"
          role="status"
          aria-label="비밀번호 로그인 안내"
        >
          <span className="password-setup-guidance-icon" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="5" y="10" width="14" height="11" rx="3" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
          </span>
          <div className="password-setup-guidance-copy">
            <strong>비밀번호 로그인 설정</strong>
            <p>
              비밀번호를 등록하면 이메일 인증번호 없이 로그인할 수 있습니다.
            </p>
          </div>
          <button
            className="password-setup-guidance-action"
            type="button"
            onClick={() => {
              setDismissed(true);
              setOpen(true);
            }}
          >
            비밀번호 설정
          </button>
          <button
            className="password-setup-guidance-close"
            type="button"
            aria-label="비밀번호 설정 안내 닫기"
            onClick={() => setDismissed(true)}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </section>
      )}
      {open && (
        <AccountPasswordDialog
          mode="set"
          email={email}
          token={token}
          onClose={() => setOpen(false)}
          onDone={() => {
            queryClient.clear();
            clearSessions();
            navigate('/login?password=changed', { replace: true });
          }}
        />
      )}
    </>
  );
}

export default function PasswordSetupGuidance() {
  const session = useSessionStore((state) => state.generalSession);
  return session ? (
    <AccountGuidance
      key={session.account.email}
      email={session.account.email}
      token={session.accessToken}
    />
  ) : null;
}
