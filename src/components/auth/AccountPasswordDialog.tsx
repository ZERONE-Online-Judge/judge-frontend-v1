import { useEffect, useState } from 'react';
import { z } from 'zod';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import {
  getAccountPassword,
  requestAccountPassword,
  confirmAccountPassword,
  confirmAccountPasswordWithPasskey,
  getLoginOptions,
} from '@/domains/identityAccess/accountPasswords';
import { formatUserApiError } from '@/shared/api/errors';
import {
  PasswordInput,
  PasswordRequirements,
  PasswordMatch,
} from './PasswordInput';
import { validNewPassword } from './passwordPolicy';
import {
  getPasskeys,
  supportsPasskeys,
  verifyPasswordPasskey,
  passkeyError,
} from '@/domains/identityAccess/passkeys';

export default function AccountPasswordDialog({
  token,
  email: initialEmail,
  mode,
  onClose,
  onDone,
}: {
  token?: string;
  email: string;
  mode: 'set' | 'reset';
  onClose: () => void;
  onDone: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [hasPassword, setHasPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyProof, setPasskeyProof] = useState('');
  const [proofExpiresAt, setProofExpiresAt] = useState(0);
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!token || mode !== 'set') return;
    let active = true;
    void getAccountPassword(token)
      .then((r) => {
        if (active) setHasPassword(r.has_password);
      })
      .catch((e) => {
        if (active)
          setError(
            formatUserApiError(e, '비밀번호 상태를 확인하지 못했습니다'),
          );
      });
    return () => {
      active = false;
    };
  }, [token, mode]);
  useEffect(() => {
    if (!supportsPasskeys()) return;
    if (mode === 'reset' && !z.email().safeParse(email.trim()).success) return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        const lookup =
          mode === 'set' && token
            ? getPasskeys(token).then((result) => result.passkeys.length > 0)
            : getLoginOptions(email.trim()).then(
                (result) =>
                  result.password_available && result.passkey_available,
              );
        void lookup
          .then((available) => {
            if (active) setPasskeyAvailable(available);
          })
          .catch(() => {
            /* Email verification remains available. */
          });
      },
      mode === 'reset' ? 400 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [email, mode, token]);
  const cooldown = Math.max(0, 30 - Math.floor((clock - sentAt) / 1000));
  const expires = passkeyProof
    ? Math.max(0, Math.ceil((proofExpiresAt - clock) / 1000))
    : Math.max(0, 300 - Math.floor((clock - sentAt) / 1000));
  async function verifyPasskey() {
    if (busy) return;
    if (!z.email().safeParse(email.trim()).success) {
      setError('올바른 이메일을 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await verifyPasswordPasskey(
        mode,
        token,
        mode === 'reset' ? email.trim() : undefined,
      );
      setPasskeyProof(result.proof_token);
      setProofExpiresAt(Date.now() + result.valid_seconds * 1000);
      setClock(Date.now());
      setSent(false);
      setCode('');
      setPassword('');
      setRepeat('');
    } catch (e) {
      setError(
        passkeyError(e) ??
          formatUserApiError(e, '패스키로 본인 확인을 하지 못했습니다'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function request() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestAccountPassword(token, mode === 'reset' ? email : undefined);
      setPasskeyProof('');
      setProofExpiresAt(0);
      setSent(true);
      setCode('');
      setSentAt(Date.now());
      setClock(Date.now());
    } catch (e) {
      setError(formatUserApiError(e, '인증번호를 요청하지 못했습니다'));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy) return;
    if (expires <= 0) {
      setError('인증이 만료되었습니다. 다시 인증해 주세요.');
      return;
    }
    if (!passkeyProof && !/^[0-9]{6}$/.test(code)) {
      setError('인증번호 6자리를 입력해 주세요.');
      return;
    }
    if (!validNewPassword(password)) {
      setError('비밀번호 조건을 모두 충족해 주세요.');
      return;
    }
    if (password !== repeat) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (passkeyProof) {
        await confirmAccountPasswordWithPasskey(
          passkeyProof,
          password,
          token,
          mode === 'reset' ? email.trim() : undefined,
        );
      } else {
        await confirmAccountPassword(
          code,
          password,
          token,
          mode === 'reset' ? email.trim() : undefined,
        );
      }
      setPasskeyProof('');
      setProofExpiresAt(0);
      setPassword('');
      setRepeat('');
      setCode('');
      onDone(email);
    } catch (e) {
      setError(formatUserApiError(e, '비밀번호를 변경하지 못했습니다'));
    } finally {
      setBusy(false);
    }
  }
  const fieldClass = 'rounded-lg border border-slate-200 px-3 py-2';
  return (
    <ModalDialog
      size={sent || passkeyProof ? 'md' : 'sm'}
      closeOnBackdrop={false}
      eyebrow="ZOJ / ACCOUNT SECURITY"
      title={
        mode === 'reset'
          ? '비밀번호 찾기'
          : hasPassword
            ? '비밀번호 변경'
            : '비밀번호 등록'
      }
      onClose={busy ? undefined : onClose}
      description="이메일 또는 등록된 패스키로 본인 확인 후 비밀번호를 설정하세요."
      footer={
        <ModalButton disabled={busy} onClick={onClose}>
          닫기
        </ModalButton>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (sent || passkeyProof ? save() : request());
        }}
      >
        <label className="grid gap-1 text-sm">
          이메일
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            readOnly={mode === 'set'}
            disabled={busy}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
              setSent(false);
              setPasskeyProof('');
              setProofExpiresAt(0);
              setPasskeyAvailable(false);
              setCode('');
              setPassword('');
              setRepeat('');
              setSentAt(0);
            }}
            className={fieldClass}
          />
        </label>
        {!sent && !passkeyProof ? (
          <>
            <p className="text-sm text-slate-500">
              {mode === 'reset'
                ? '비밀번호를 등록한 계정이라면 인증번호를 보내드립니다.'
                : hasPassword
                  ? '이메일 또는 등록된 패스키로 본인 확인 후 변경할 수 있습니다.'
                  : '등록하면 다음 로그인부터 비밀번호를 사용할 수 있습니다.'}
            </p>
            {passkeyAvailable && (
              <ModalButton
                tone="primary"
                disabled={busy || !email}
                onClick={() => void verifyPasskey()}
              >
                {busy ? '인증 중…' : '패스키로 인증'}
              </ModalButton>
            )}
            <ModalButton
              type="submit"
              tone={passkeyAvailable ? 'secondary' : 'primary'}
              disabled={busy || !email}
            >
              {busy ? '요청 중…' : '이메일 인증번호 받기'}
            </ModalButton>
          </>
        ) : (
          <>
            <p
              role="status"
              className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800"
            >
              {passkeyProof
                ? '패스키로 본인 확인을 완료했습니다. '
                : '등록된 이메일로 인증번호를 발송 요청했습니다. '}
              {expires > 0
                ? `남은 시간 ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`
                : '인증이 만료되었습니다. 다시 인증해 주세요.'}
            </p>
            {!passkeyProof && (
              <label className="grid gap-1 text-sm">
                인증번호
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                  className={fieldClass}
                />
              </label>
            )}
            <PasswordInput
              label="새 비밀번호"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
            <PasswordRequirements value={password} />
            <PasswordInput
              label="새 비밀번호 확인"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={repeat}
              disabled={busy}
              onChange={(e) => setRepeat(e.target.value)}
              className={fieldClass}
            />
            <PasswordMatch password={password} repeat={repeat} />
            <p className="text-xs leading-5 text-slate-500">
              변경하면 기존 로그인은 모두 해제됩니다. 이메일 인증번호 로그인도
              계속 사용할 수 있습니다.
            </p>
            <button
              disabled={
                busy ||
                expires <= 0 ||
                !validNewPassword(password) ||
                password !== repeat ||
                (!passkeyProof && !/^[0-9]{6}$/.test(code))
              }
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? '저장 중…'
                : mode === 'reset'
                  ? '비밀번호 재설정'
                  : hasPassword
                    ? '비밀번호 변경'
                    : '비밀번호 등록'}
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void request()}
              className="text-sm text-indigo-600 disabled:text-slate-400"
            >
              {cooldown > 0
                ? `${cooldown}초 후 다시 받기`
                : passkeyProof
                  ? '이메일로 대신 인증'
                  : '인증번호 다시 받기'}
            </button>
            {passkeyAvailable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void verifyPasskey()}
                className="text-sm text-indigo-600 disabled:text-slate-400"
              >
                {passkeyProof ? '패스키로 다시 인증' : '패스키로 대신 인증'}
              </button>
            )}
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </form>
    </ModalDialog>
  );
}
