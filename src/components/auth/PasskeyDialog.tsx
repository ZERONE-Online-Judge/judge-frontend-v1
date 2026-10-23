import { useEffect, useState } from 'react';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import PageNotice from '@/shared/ui/PageNotice';
import { formatUserApiError, isApiClientError } from '@/shared/api/errors';
import {
  getPasskeys,
  registerPasskey,
  removePasskey,
  supportsPasskeys,
  requestSecurityCode,
  verifySecurityCode,
  passkeyError,
  type AccountPasskey,
} from '@/domains/identityAccess/passkeys';
import './PasskeyDialog.css';

export default function PasskeyDialog({
  token,
  email,
  enrollment = false,
  onClose,
}: {
  token: string;
  email: string;
  enrollment?: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AccountPasskey[]>([]);
  const [recent, setRecent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('내 패스키');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [removing, setRemoving] = useState<AccountPasskey | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const supported = supportsPasskeys();
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    let active = true;
    getPasskeys(token)
      .then((data) => {
        if (active) {
          setItems(data.passkeys);
          setRecent(data.recently_verified);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(
            formatUserApiError(error, '패스키 목록을 불러오지 못했습니다'),
          );
          setFailed(true);
        }
      });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await action();
    } catch (error) {
      if (
        isApiClientError(error) &&
        error.code === 'recent_verification_required'
      )
        setRecent(false);
      setFailed(true);
      setMessage(
        passkeyError(error) ??
          formatUserApiError(error, '요청을 완료하지 못했습니다'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const data = await getPasskeys(token);
    setItems(data.passkeys);
    setRecent(data.recently_verified);
  }
  return (
    <ModalDialog
      title={
        enrollment && !items.length ? '패스키를 추가할까요?' : '패스키 관리'
      }
      description={email}
      onClose={busy ? undefined : onClose}
      closeOnBackdrop={!busy}
      footer={
        <ModalButton disabled={busy} onClick={onClose}>
          {enrollment && !items.length ? '나중에 하기' : '완료'}
        </ModalButton>
      }
    >
      <div className="passkey-content">
        <p className="zoj-modal-copy">
          지문·얼굴 인식 또는 기기 PIN으로 간편하게 로그인하세요. 생체 정보는
          ZOJ에 전달되지 않습니다.
        </p>
        {!supported && (
          <p className="passkey-hint">
            이 브라우저에서는 패스키를 사용할 수 없습니다. 이메일 인증으로 계속
            로그인할 수 있습니다.
          </p>
        )}
        {loaded && !recent && (
          <section className="passkey-verification">
            <strong>본인 인증</strong>
            <p>
              패스키를 추가하거나 삭제하려면 이메일 인증을 먼저 진행해 주세요.
            </p>
            <ModalButton
              disabled={busy || cooldown > 0}
              onClick={() =>
                void run(async () => {
                  const data = await requestSecurityCode(token);
                  setChallengeId(data.challenge_id);
                  setCode('');
                  setCooldownUntil(Date.now() + data.cooldown_seconds * 1000);
                  setMessage(
                    '이메일로 인증번호를 보냈습니다. 5분 안에 입력해 주세요.',
                  );
                })
              }
            >
              {cooldown > 0
                ? `${cooldown}초 후 재전송`
                : challengeId
                  ? '인증번호 다시 받기'
                  : '이메일 인증번호 받기'}
            </ModalButton>
            {challengeId && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await verifySecurityCode(token, challengeId, code);
                    setRecent(true);
                    setCode('');
                    setChallengeId('');
                    setMessage('본인 인증을 완료했습니다.');
                  });
                }}
              >
                <label htmlFor="passkey-code">이메일 인증번호</label>
                <input
                  id="passkey-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  disabled={busy}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ''))
                  }
                />
                <ModalButton
                  type="submit"
                  tone="primary"
                  disabled={busy || code.length !== 6}
                >
                  인증하기
                </ModalButton>
              </form>
            )}
          </section>
        )}
        {loaded && items.length > 0 && (
          <ul className="passkey-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    등록{' '}
                    {new Date(item.created_at * 1000).toLocaleDateString(
                      'ko-KR',
                    )}
                    {item.last_used_at
                      ? ` · 최근 사용 ${new Date(item.last_used_at * 1000).toLocaleDateString('ko-KR')}`
                      : ''}
                  </small>
                </div>
                <ModalButton
                  disabled={busy || !recent}
                  onClick={() => setRemoving(item)}
                >
                  삭제
                </ModalButton>
              </li>
            ))}
          </ul>
        )}
        {loaded && supported && recent && (
          <form
            className="passkey-add"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await registerPasskey(token, name);
                if (enrollment) {
                  onClose();
                  return;
                }
                await refresh();
                setMessage(
                  '패스키를 등록했습니다. 다음 로그인부터 사용할 수 있습니다.',
                );
              });
            }}
          >
            <label htmlFor="passkey-name">패스키 이름</label>
            <input
              id="passkey-name"
              maxLength={80}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <ModalButton
              tone="primary"
              type="submit"
              disabled={busy || items.length >= 10}
            >
              {busy ? '기기 인증을 확인해 주세요…' : '패스키 추가'}
            </ModalButton>
          </form>
        )}
        <PageNotice
          message={message}
          status={failed ? 'error' : busy ? 'loading' : 'ready'}
        />
      </div>
      {removing && (
        <ModalDialog
          title="패스키를 삭제할까요?"
          onClose={busy ? undefined : () => setRemoving(null)}
          footer={
            <>
              <ModalButton disabled={busy} onClick={() => setRemoving(null)}>
                취소
              </ModalButton>
              <ModalButton
                tone="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await removePasskey(token, removing.id);
                    setRemoving(null);
                    await refresh();
                    setMessage(
                      '패스키를 삭제했습니다. 이메일 인증으로도 로그인할 수 있습니다.',
                    );
                  })
                }
              >
                삭제
              </ModalButton>
            </>
          }
        >
          <p className="zoj-modal-copy">
            {removing.name} 패스키로 더 이상 로그인할 수 없습니다. 기기의 패스키
            관리자에서도 직접 삭제할 수 있습니다.
          </p>
          {failed && <PageNotice message={message} status="error" />}
        </ModalDialog>
      )}
    </ModalDialog>
  );
}
