import { loginPresentation } from '@/domains/presentationAccess/api';
import {
  isPresentationEmail,
  presentationPath,
  usePresentationSession,
} from '@/domains/presentationAccess/session';
import { hasParticipantPreviewAccess } from '@/domains/identityAccess/participantPreview';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { z } from 'zod';
import './LoginPage.css';
import { loginGuideQuestions } from '@/data/loginGuideContent';
import { loginPageText } from '@/data/uiText';
import {
  requestGeneralOtp,
  verifyGeneralOtp,
} from '@/domains/identityAccess/api';
import { isServiceMaster } from '@/domains/identityAccess/permissions';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import type { GeneralSession } from '@/domains/identityAccess/types';
import {
  type ApiClientError,
  formatUserApiError,
  isApiClientError,
  readRetryAfterSeconds,
} from '@/shared/api/errors';
import { readLoginRedirectTarget } from '@/shared/lib/loginRedirect';
import PageNotice from '@/shared/ui/PageNotice';
import {
  loginGeneralPassword,
  getLoginOptions,
} from '@/domains/identityAccess/accountPasswords';
import AccountPasswordDialog from '@/components/auth/AccountPasswordDialog';
import PasskeyDialog from '@/components/auth/PasskeyDialog';
import {
  getPasskeys,
  loginPasskey,
  confirmPasskeyLoginTransfer,
  supportsPasskeys,
  passkeyError,
} from '@/domains/identityAccess/passkeys';
import { PasswordInput } from '@/components/auth/PasswordInput';

const OTP_VALID_SECONDS = 5 * 60;

const loginSchema = z.object({
  email: z.email(loginPageText.emailValidation),
  otpCode: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type PendingSessionReplacement = {
  activeSessionCount: number;
  email: string;
  lastSeenAt?: string | null;
  otpCode: string;
  method?: 'password' | 'passkey';
  transferToken?: string;
} | null;

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function currentTimestamp() {
  return new Date().getTime();
}

function formatLoginError(error: unknown) {
  if (
    isApiClientError(error) &&
    error.status === 401 &&
    error.code === 'invalid_credentials'
  ) {
    return loginPageText.invalidCredentials;
  }

  return formatUserApiError(error, loginPageText.loginFailed);
}

function isUnregisteredEmailError(error: unknown) {
  if (!isApiClientError(error)) return false;

  const code = error.code.toLowerCase();
  const message = error.message.toLowerCase();
  const notFoundCodes = new Set([
    'account_not_found',
    'email_not_found',
    'email_not_registered',
    'general_account_not_found',
    'not_found',
    'user_not_found',
  ]);

  return (
    error.status === 404 ||
    notFoundCodes.has(code) ||
    code.includes('not_found') ||
    code.includes('not_registered') ||
    message.includes('not registered') ||
    message.includes('not found') ||
    message.includes('no account')
  );
}

function isSessionConflictError(error: unknown): error is ApiClientError {
  return (
    isApiClientError(error) &&
    error.status === 409 &&
    error.code === 'session_conflict'
  );
}

function sessionConflictDetails(error: unknown) {
  if (!isSessionConflictError(error)) {
    return { activeSessionCount: 1, lastSeenAt: null };
  }

  const activeSessionCount = error.details?.active_session_count;
  const lastSeenAt = error.details?.last_seen_at;
  return {
    activeSessionCount:
      typeof activeSessionCount === 'number' ? activeSessionCount : 1,
    lastSeenAt: typeof lastSeenAt === 'string' ? lastSeenAt : null,
  };
}

function contestIdFromParticipantPath(path: string | null) {
  const match = path?.match(/^\/contests\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function postLoginRedirectPath(
  session: GeneralSession,
  searchParams: URLSearchParams,
) {
  const contestId = searchParams.get('contestId');
  const moveTo = readLoginRedirectTarget(searchParams);
  const fallback = contestId
    ? `/contests/${encodeURIComponent(contestId)}`
    : '/';
  const target = moveTo ?? fallback;
  const targetContestId = contestIdFromParticipantPath(target) ?? contestId;
  const previewRequested =
    new URL(target, window.location.origin).searchParams.get('preview') === '1';
  const isParticipantContest = session.participantContests.some(
    (item) => item.contest.contest_id === targetContestId,
  );
  const isOperatorContest = session.operatorContests.some(
    (item) => item.contest.contest_id === targetContestId,
  );

  if (
    targetContestId &&
    !(
      previewRequested && hasParticipantPreviewAccess(session, targetContestId)
    ) &&
    !isParticipantContest &&
    (isOperatorContest || isServiceMaster(session))
  ) {
    return `/operator/contests/${encodeURIComponent(targetContestId)}`;
  }

  return target;
}

export default function LoginPage() {
  const [loginMethod, setLoginMethod] = useState<
    'email' | 'otp' | 'password' | 'passkey' | 'verify'
  >('email');
  const [enrollmentSession, setEnrollmentSession] =
    useState<GeneralSession | null>(null);
  const [loginOptions, setLoginOptions] = useState({
    password_available: false,
    passkey_available: false,
  });
  const [additionalVerification, setAdditionalVerification] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const emailChanged = searchParams.get('reason') === 'email_changed';
  const changedEmail =
    emailChanged && typeof location.state?.emailChangedTo === 'string'
      ? location.state.emailChangedTo
      : '';
  const setGeneralSession = useSessionStore((state) => state.setGeneralSession);
  const setParticipantSession = useSessionStore(
    (state) => state.setParticipantSession,
  );
  const generalSession = useSessionStore((state) => state.generalSession);
  const [otpRequested, setOtpRequested] = useState(false);
  const [requestedOtpEmail, setRequestedOtpEmail] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [message, setMessage] = useState(() =>
    searchParams.get('password') === 'changed'
      ? '비밀번호가 변경되어 기존 로그인 연결이 모두 해제되었습니다. 새 비밀번호로 다시 로그인해 주세요.'
      : searchParams.get('reason') === 'presentation'
        ? '프레젠테이션 전용 계정으로 로그인해 주세요. 연결이 종료되었다면 계정의 유효기간과 사용 상태를 확인해 주세요.'
        : searchParams.get('reason') === 'session'
          ? '로그인 세션이 만료되었거나 다른 위치에서 해제되었습니다. 다시 로그인해 주세요.'
          : emailChanged
            ? '이메일을 변경했습니다. 새 이메일로 다시 로그인해 주세요.'
            : '',
  );
  const [messageStatus, setMessageStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >(() =>
    searchParams.get('reason') === 'session'
      ? 'error'
      : emailChanged || searchParams.get('password') === 'changed'
        ? 'ready'
        : 'idle',
  );
  const [email, setEmail] = useState(changedEmail);
  const presentationLogin = isPresentationEmail(email);
  const editorOnboarding = /^\/editor\/(?:return|account)(?:\?|$)/.test(
    readLoginRedirectTarget(searchParams) ?? '',
  );
  const [otpCode, setOtpCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSessionReplacement, setPendingSessionReplacement] =
    useState<PendingSessionReplacement>(null);
  const [now, setNow] = useState(currentTimestamp);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const shouldShowContestLoginModal = searchParams.get('reason') === 'contest';
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const otpExpiresSeconds = Math.max(0, Math.ceil((otpExpiresAt - now) / 1000));
  const canReuseOtp =
    otpRequested && requestedOtpEmail === email.trim() && otpExpiresSeconds > 0;
  const canUsePasskey = loginOptions.passkey_available && supportsPasskeys();
  const canRequestOtp =
    Boolean(email.trim()) && cooldownSeconds <= 0 && !isSubmitting;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentTimestamp()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!otpRequested) return;

    otpInputRef.current?.focus();
  }, [otpRequested]);

  useEffect(() => {
    if (
      !generalSession ||
      isSubmitting ||
      pendingSessionReplacement ||
      (enrollmentSession &&
        generalSession.account.email === enrollmentSession.account.email)
    )
      return;

    navigate(postLoginRedirectPath(generalSession, searchParams), {
      replace: true,
    });
  }, [
    generalSession,
    enrollmentSession,
    isSubmitting,
    navigate,
    pendingSessionReplacement,
    searchParams,
  ]);

  async function completeLogin(session: GeneralSession, offerPasskey = false) {
    let offer = false;
    if (offerPasskey && supportsPasskeys()) {
      try {
        offer = (await getPasskeys(session.accessToken)).passkeys.length === 0;
      } catch {
        /* Login remains available if enrollment status is unavailable. */
      }
    }
    setPendingSessionReplacement(null);
    setPassword('');
    if (offer) setEnrollmentSession(session);
    setGeneralSession(session);
    setParticipantSession(null);
    if (!offer)
      navigate(postLoginRedirectPath(session, searchParams), { replace: true });
  }

  async function submitPasskeyLogin() {
    if (!validateEmail() || isSubmitting || loginMethod === 'email') return;
    setIsSubmitting(true);
    setMessage('기기의 패스키 인증을 진행해 주세요.');
    setMessageStatus('loading');
    try {
      const session = await loginPasskey(email.trim());
      await completeLogin(session);
    } catch (error) {
      if (isSessionConflictError(error)) {
        const details = sessionConflictDetails(error);
        const transferToken = error.details?.transfer_token;
        if (typeof transferToken === 'string' && transferToken.length >= 32) {
          setPendingSessionReplacement({
            ...details,
            email: email.trim(),
            otpCode: '',
            method: 'passkey',
            transferToken,
          });
          setMessage(
            '패스키 인증을 완료했습니다. 이 브라우저에서 계속 사용할지 선택해 주세요.',
          );
          setMessageStatus('ready');
          return;
        }
      }
      setMessage(
        passkeyError(error) ??
          formatUserApiError(
            error,
            '패스키 로그인에 실패했습니다. 이메일 인증으로도 로그인할 수 있습니다',
          ),
      );
      setMessageStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  function validateEmail() {
    const parsed = loginSchema.safeParse({ email, otpCode });
    if (parsed.success) {
      setEmailError('');
      return true;
    }

    const issue = parsed.error.issues.find((item) =>
      item.path.includes('email'),
    );
    setEmailError(issue?.message ?? loginPageText.emailValidation);
    return false;
  }

  function resetOtpAfterEmailChange() {
    setPendingSessionReplacement(null);
    setAdditionalVerification(false);
    setLoginOptions({ password_available: false, passkey_available: false });
    setOtpRequested(false);
    setRequestedOtpEmail('');
    setOtpExpiresAt(0);
    setCooldownUntil(0);
    setOtpCode('');
    setMessage(loginPageText.emailChanged);
    setMessageStatus('idle');
  }

  async function chooseLoginMethod() {
    if (!validateEmail() || isSubmitting) return;
    setIsSubmitting(true);
    setMessage('');
    setMessageStatus('loading');
    try {
      const options = await getLoginOptions(email.trim());
      setLoginOptions(options);
      if (options.password_available) {
        setLoginMethod('password');
        setMessageStatus('idle');
      } else {
        await requestOtp();
      }
    } catch (error) {
      setMessage(
        formatUserApiError(error, '로그인 방식을 확인하지 못했습니다'),
      );
      setMessageStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function requestOtp() {
    if (!validateEmail()) return;

    const requestedEmail = email.trim();

    setMessage(loginPageText.otpRequesting);
    setMessageStatus('loading');
    setIsSubmitting(true);

    try {
      const response = editorOnboarding
        ? await requestGeneralOtp(requestedEmail, true)
        : await requestGeneralOtp(requestedEmail);
      const cooldown =
        response.cooldown_seconds > 0 ? response.cooldown_seconds : 10;
      const requestedAt = currentTimestamp();

      setLoginMethod('otp');
      setOtpCode('');
      setOtpRequested(true);
      setRequestedOtpEmail(requestedEmail);
      setCooldownUntil(requestedAt + cooldown * 1000);
      setOtpExpiresAt(requestedAt + OTP_VALID_SECONDS * 1000);
      setMessage(loginPageText.otpSent);
      setMessageStatus('ready');
      return true;
    } catch (error) {
      const retryAfter = readRetryAfterSeconds(error);

      if (retryAfter > 0) {
        setCooldownUntil(currentTimestamp() + retryAfter * 1000);
      }

      setMessage(
        isUnregisteredEmailError(error)
          ? loginPageText.unregisteredEmail
          : formatUserApiError(error, loginPageText.otpRequestFailed),
      );
      setMessageStatus('error');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function selectEmailLogin() {
    setPassword('');
    if (canReuseOtp) {
      setLoginMethod('otp');
      setMessage(loginPageText.otpSent);
      setMessageStatus('ready');
      return;
    }
    await requestOtp();
  }

  async function submitLogin(values: LoginFormValues, forceNewSession = false) {
    if (!validateEmail()) return;

    if (presentationLogin) {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setMessage('프레젠테이션을 여는 중입니다.');
      setMessageStatus('loading');
      try {
        const session = await loginPresentation(values.email);
        useSessionStore.getState().clearSessions();
        usePresentationSession.getState().setSession(session);
        navigate(presentationPath(session.contest_id), { replace: true });
      } catch (error) {
        setMessage(
          formatUserApiError(error, '프레젠테이션 로그인에 실패했습니다'),
        );
        setMessageStatus('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (!otpRequested) {
      await requestOtp();
      return;
    }

    if (!values.otpCode?.trim()) {
      setMessage(loginPageText.otpRequired);
      setMessageStatus('error');
      return;
    }

    if (otpExpiresSeconds <= 0) {
      setMessage(loginPageText.otpExpired);
      setMessageStatus('error');
      return;
    }

    setMessage(loginPageText.loginSubmitting);
    setMessageStatus('loading');
    setIsSubmitting(true);

    try {
      const session = await verifyGeneralOtp(
        requestedOtpEmail || values.email.trim(),
        values.otpCode.trim(),
        generalSession,
        forceNewSession,
      );

      await completeLogin(session, true);
      setMessage(loginPageText.loginReady);
      setMessageStatus('ready');
      setOtpRequested(false);
      setRequestedOtpEmail('');
      setOtpExpiresAt(0);
      setOtpCode('');
    } catch (error) {
      if (!forceNewSession && isSessionConflictError(error)) {
        const details = sessionConflictDetails(error);
        setPendingSessionReplacement({
          activeSessionCount: details.activeSessionCount,
          email: requestedOtpEmail || values.email.trim(),
          lastSeenAt: details.lastSeenAt,
          otpCode: values.otpCode.trim(),
        });
        setMessage(
          '이미 사용 중인 세션이 있습니다. 이 브라우저에서 계속 사용할지 선택해 주세요.',
        );
        setMessageStatus('error');
        return;
      }
      setMessage(formatLoginError(error));
      setMessageStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelSessionReplacement() {
    setPassword('');
    setPendingSessionReplacement(null);
    setMessage(
      '기존 세션을 유지했습니다. 이 브라우저에서는 로그인하지 않았습니다.',
    );
    setMessageStatus('idle');
  }

  async function confirmSessionReplacement() {
    if (!pendingSessionReplacement || isSubmitting) return;
    if (pendingSessionReplacement.method === 'passkey') {
      const { email: verifiedEmail, transferToken } = pendingSessionReplacement;
      if (!transferToken) return;
      setIsSubmitting(true);
      setMessage('로그인하고 있습니다.');
      setMessageStatus('loading');
      try {
        await completeLogin(
          await confirmPasskeyLoginTransfer(verifiedEmail, transferToken),
        );
      } catch (error) {
        setPendingSessionReplacement(null);
        setMessage(
          formatUserApiError(
            error,
            '로그인에 실패했습니다. 다시 시도해 주세요.',
          ),
        );
        setMessageStatus('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (pendingSessionReplacement.method === 'password') {
      void submitPasswordLogin(true);
      return;
    }
    void submitLogin(
      {
        email: pendingSessionReplacement.email,
        otpCode: pendingSessionReplacement.otpCode,
      },
      true,
    );
  }

  function closeContestLoginModal() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('reason');
    setSearchParams(nextParams, { replace: true });
  }

  async function submitPasswordLogin(forceNewSession = false) {
    if (!validateEmail() || isSubmitting) return;
    setIsSubmitting(true);
    setMessageStatus('loading');
    setMessage('로그인하고 있습니다.');
    try {
      const session = await loginGeneralPassword(
        email.trim(),
        password,
        forceNewSession,
      );
      await completeLogin(session);
    } catch (error) {
      if (
        isApiClientError(error) &&
        error.code === 'additional_verification_required'
      ) {
        setPassword('');
        setAdditionalVerification(true);
        setLoginMethod('verify');
        setMessage('새로운 브라우저 또는 IP입니다. 인증 방법을 선택해 주세요.');
        setMessageStatus('ready');
        return;
      }
      if (!forceNewSession && isSessionConflictError(error)) {
        const details = sessionConflictDetails(error);
        setPendingSessionReplacement({
          activeSessionCount: details.activeSessionCount,
          email: email.trim(),
          lastSeenAt: details.lastSeenAt,
          otpCode: '',
          method: 'password',
        });
      }
      setMessage(
        isApiClientError(error) && error.status === 401
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : formatUserApiError(error, '비밀번호 로그인에 실패했습니다'),
      );
      setMessageStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      {enrollmentSession &&
        generalSession?.account.email === enrollmentSession.account.email && (
          <PasskeyDialog
            token={enrollmentSession.accessToken}
            email={enrollmentSession.account.email}
            enrollment
            onClose={() => {
              const session = enrollmentSession;
              setEnrollmentSession(null);
              navigate(postLoginRedirectPath(session, searchParams), {
                replace: true,
              });
            }}
          />
        )}
      {passwordResetOpen && (
        <AccountPasswordDialog
          mode="reset"
          email={email}
          onClose={() => setPasswordResetOpen(false)}
          onDone={(address) => {
            setPasswordResetOpen(false);
            resetOtpAfterEmailChange();
            setEmail(address);
            setLoginMethod('password');
            setLoginOptions({
              password_available: true,
              passkey_available:
                address.trim().toLowerCase() === email.trim().toLowerCase() &&
                loginOptions.passkey_available,
            });
            setPassword('');
            setMessage(
              '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.',
            );
            setMessageStatus('ready');
          }}
        />
      )}
      {shouldShowContestLoginModal ? (
        <ModalDialog
          titleId="contest-login-required-title"
          title={loginPageText.contestRequiredTitle}
          onClose={closeContestLoginModal}
          footer={
            <ModalButton tone="primary" onClick={closeContestLoginModal}>
              {loginPageText.modalConfirm}
            </ModalButton>
          }
        >
          <p className="zoj-modal-copy">
            {loginPageText.contestRequiredDescription}
          </p>
        </ModalDialog>
      ) : null}

      {pendingSessionReplacement ? (
        <ModalDialog
          titleId="session-replacement-title"
          title="기존 로그인 연결을 끊을까요?"
          onClose={isSubmitting ? undefined : cancelSessionReplacement}
          footer={
            <>
              <ModalButton
                disabled={isSubmitting}
                onClick={cancelSessionReplacement}
              >
                이전 세션 유지
              </ModalButton>
              <ModalButton
                tone="primary"
                disabled={isSubmitting}
                onClick={confirmSessionReplacement}
              >
                이 브라우저에서 사용
              </ModalButton>
            </>
          }
        >
          <p className="zoj-modal-copy">
            이 계정은 이미 다른 브라우저 또는 기기에서 로그인 중입니다. 이
            브라우저에서 계속 사용하면 이전 세션은 로그아웃됩니다.
          </p>
          <div className="zoj-card mt-4 px-4 py-3 text-sm text-slate-600">
            활성 세션 {pendingSessionReplacement.activeSessionCount}개
            {pendingSessionReplacement.lastSeenAt ? (
              <>
                {' · 마지막 사용 '}
                {new Intl.DateTimeFormat('ko-KR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(pendingSessionReplacement.lastSeenAt))}
              </>
            ) : null}
          </div>
        </ModalDialog>
      ) : null}

      <div className="login-shell">
        <form
          className="login-card"
          aria-labelledby="login-card-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (loginMethod === 'verify' && canUsePasskey && !presentationLogin)
              return;
            void (loginMethod === 'email' && !presentationLogin
              ? chooseLoginMethod()
              : loginMethod === 'passkey' && !presentationLogin
                ? submitPasskeyLogin()
                : loginMethod === 'password' && !presentationLogin
                  ? submitPasswordLogin()
                  : loginMethod === 'verify' && !presentationLogin
                    ? selectEmailLogin()
                    : submitLogin({ email, otpCode }));
          }}
        >
          <div className="login-card-heading">
            <h1 id="login-card-title">
              {presentationLogin
                ? '프레젠테이션 로그인'
                : additionalVerification
                  ? '본인 확인'
                  : loginPageText.title}
            </h1>
            <p>
              {presentationLogin
                ? '인증번호 없이 해당 대회의 발표 화면을 엽니다.'
                : loginMethod === 'passkey'
                  ? '이 계정에 등록한 패스키로 인증해 주세요.'
                  : additionalVerification
                    ? canUsePasskey
                      ? '이메일 인증 또는 패스키로 본인 확인을 완료해 주세요.'
                      : '이메일 인증으로 본인 확인을 완료해 주세요.'
                    : loginMethod === 'verify'
                      ? '새로운 환경에서는 본인 확인이 한 번 더 필요합니다.'
                      : loginMethod === 'password'
                        ? '등록한 이메일과 비밀번호로 로그인하세요.'
                        : otpRequested
                          ? '이메일로 받은 인증번호를 입력해 주세요.'
                          : '로그인할 이메일을 입력해 주세요.'}
            </p>
          </div>

          <div className="login-field">
            <label htmlFor="login-email">{loginPageText.emailLabel}</label>
            <input
              id="login-email"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'login-email-error' : undefined}
              disabled={isSubmitting}
              readOnly={loginMethod !== 'email' && !presentationLogin}
              placeholder={loginPageText.emailPlaceholder}
              type="email"
              value={email}
              onChange={(event) => {
                const nextEmail = event.target.value;
                setEmail(nextEmail);
                if (emailError) setEmailError('');
                if (
                  otpRequested &&
                  requestedOtpEmail &&
                  nextEmail.trim() !== requestedOtpEmail
                ) {
                  resetOtpAfterEmailChange();
                }
              }}
            />
            {emailError && (
              <p
                id="login-email-error"
                role="alert"
                className="login-field-error"
              >
                {emailError}
              </p>
            )}
          </div>

          {loginMethod !== 'email' && !presentationLogin && (
            <button
              className="text-sm text-slate-500"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setLoginMethod('email');
                setPassword('');
                resetOtpAfterEmailChange();
                setMessage('');
              }}
            >
              다른 이메일 사용
            </button>
          )}

          {loginMethod === 'passkey' && !presentationLogin ? (
            <button
              className="login-action"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? '기기 인증을 확인해 주세요…' : '패스키로 로그인'}
            </button>
          ) : loginMethod === 'verify' && !presentationLogin ? (
            <div
              className="login-verification-methods"
              role="group"
              aria-label="본인 확인 방법"
            >
              <button
                className="login-action"
                type="button"
                disabled={isSubmitting || (!canReuseOtp && cooldownSeconds > 0)}
                onClick={() => void selectEmailLogin()}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <span>이메일로 인증</span>
              </button>
              {canUsePasskey && (
                <button
                  className="login-action"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void submitPasskeyLogin()}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="9" r="5" />
                    <path d="m11.5 12.5 8 8H22v-3h-3v-3h-3" />
                  </svg>
                  <span>패스키로 인증</span>
                </button>
              )}
            </div>
          ) : loginMethod === 'password' && !presentationLogin ? (
            <>
              <div className="login-field">
                <PasswordInput
                  label="비밀번호"
                  id="login-password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                className="login-action"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? '로그인 중…' : '비밀번호로 로그인'}
              </button>
              <button
                className="text-sm text-slate-500"
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setPassword('');
                  setPasswordResetOpen(true);
                }}
              >
                비밀번호 찾기
              </button>
            </>
          ) : otpRequested ? (
            <>
              <div className="login-field">
                <div className="login-field-heading">
                  <label htmlFor="login-otp">{loginPageText.otpLabel}</label>
                  <span id="login-otp-expiry" className="login-expiry">
                    {otpExpiresSeconds > 0
                      ? `남은 시간 ${formatSeconds(otpExpiresSeconds)}`
                      : loginPageText.otpExpiredLabel}
                  </span>
                </div>
                <input
                  id="login-otp"
                  autoComplete="one-time-code"
                  aria-describedby="login-otp-expiry"
                  inputMode="numeric"
                  disabled={isSubmitting}
                  placeholder={loginPageText.otpPlaceholder}
                  ref={otpInputRef}
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                />
              </div>
              <button
                className="login-action"
                disabled={isSubmitting || otpExpiresSeconds <= 0}
                type="submit"
              >
                {isSubmitting
                  ? loginPageText.loginSubmitting
                  : loginPageText.loginButton}
              </button>
              <div className="login-resend">
                <span>메일을 받지 못하셨나요?</span>
                <button
                  disabled={!canRequestOtp}
                  onClick={requestOtp}
                  type="button"
                >
                  {cooldownSeconds > 0
                    ? `${cooldownSeconds}초 후 재전송`
                    : '인증번호 다시 받기'}
                </button>
              </div>
            </>
          ) : (
            <button
              className="login-action"
              disabled={isSubmitting || !email.trim()}
              type="submit"
            >
              {presentationLogin
                ? isSubmitting
                  ? '접속 중…'
                  : '프레젠테이션 열기'
                : isSubmitting
                  ? '확인 중…'
                  : '다음'}
            </button>
          )}

          {!presentationLogin && loginMethod !== 'email' && (
            <div className="login-method-options" aria-label="다른 로그인 방법">
              {canUsePasskey &&
                loginMethod !== 'verify' &&
                loginMethod !== 'passkey' && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setPassword('');
                      if (additionalVerification) {
                        void submitPasskeyLogin();
                        return;
                      }
                      setLoginMethod('passkey');
                      setMessage('');
                      setMessageStatus('idle');
                    }}
                  >
                    {additionalVerification
                      ? '패스키로 인증'
                      : '패스키로 로그인'}
                  </button>
                )}
              {loginOptions.password_available &&
                !additionalVerification &&
                loginMethod !== 'password' && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setLoginMethod('password');
                      setMessage('');
                      setMessageStatus('idle');
                    }}
                  >
                    비밀번호로 로그인
                  </button>
                )}
              {loginMethod !== 'otp' && loginMethod !== 'verify' && (
                <button
                  type="button"
                  disabled={
                    isSubmitting || (!otpRequested && cooldownSeconds > 0)
                  }
                  onClick={() => void selectEmailLogin()}
                >
                  이메일로 대신 로그인
                </button>
              )}
            </div>
          )}
          <PageNotice message={message} status={messageStatus} />
          {!presentationLogin && (
            <p className="login-form-note">
              {editorOnboarding
                ? '인증 후 ZOJ Editor의 원래 작업 화면으로 돌아갑니다.'
                : otpRequested
                  ? loginPageText.spamHelp
                  : '참가자와 운영자 모두 같은 화면에서 로그인합니다.'}
            </p>
          )}
        </form>

        <details className="login-help">
          <summary>
            <svg
              className="login-help-icon"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.3 1.9-2.3 3.5" />
              <path d="M12 16h.01" strokeLinecap="round" strokeWidth="2.5" />
            </svg>
            <span>로그인 안내 · 자주 묻는 질문</span>
            <svg
              className="login-help-chevron"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                d="m7 10 5 5 5-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="login-help-body">
            {loginGuideQuestions.map((question) => (
              <details className="login-faq" key={question.title}>
                <summary>
                  <span>{question.title}</span>
                  <span className="login-faq-toggle" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="login-faq-answer">
                  {question.answers.map((answer) => (
                    <p key={answer}>{answer}</p>
                  ))}
                </div>
              </details>
            ))}
            <div className="login-support-links">
              <Link to="/support/help">도움말 보기</Link>
              <Link to="/support/contact">서비스 문의</Link>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
