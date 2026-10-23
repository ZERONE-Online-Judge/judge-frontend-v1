import InterfaceIcon from '@/components/common/InterfaceIcon';
import HeaderPanel, { HeaderIcon } from '@/components/layout/HeaderPanel';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import HeaderNotifications from '@/components/layout/HeaderNotifications';
import { headerText } from '@/data/uiText';
import { contestAccessPhase } from '@/domains/contestAdministration/logic';
import type { Contest } from '@/domains/contestAdministration/types';
import { logoutGeneral } from '@/domains/identityAccess/api';
import { isServiceMaster } from '@/domains/identityAccess/permissions';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { useRefreshGeneralSession } from '@/domains/identityAccess/useRefreshGeneralSession';
import { formatContestMoment } from '@/shared/lib/dateTime';
import PasskeyDialog from '@/components/auth/PasskeyDialog';
import AccountPasswordDialog from '@/components/auth/AccountPasswordDialog';
import { useSharedLogin } from '@/domains/identityAccess/useSharedLogin';

type HeaderAuthControlsProps = {
  loginTo: string;
};

type ContestSectionKey = 'running' | 'upcoming' | 'ended';

const accountContestSections: {
  key: ContestSectionKey;
  title: string;
}[] = [
  { key: 'running', title: '진행 중' },
  { key: 'upcoming', title: '참가 예정' },
  { key: 'ended', title: '종료된 대회' },
];

function sectionKeyForContest(contest: Contest): ContestSectionKey {
  const phase = contestAccessPhase(contest);
  if (phase === 'running') return 'running';
  if (phase === 'ended') return 'ended';
  return 'upcoming';
}

function contestSortDate(contest: Contest) {
  const sectionKey = sectionKeyForContest(contest);
  const value = sectionKey === 'ended' ? contest.end_at : contest.start_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortContestsByRecentDate<T extends { contest: Contest }>(items: T[]) {
  return [...items].sort(
    (a, b) => contestSortDate(b.contest) - contestSortDate(a.contest),
  );
}

export default function HeaderAuthControls({
  loginTo,
}: HeaderAuthControlsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useRefreshGeneralSession();
  useSharedLogin();
  const generalSession = useSessionStore((state) => state.generalSession);
  const clearSessions = useSessionStore((state) => state.clearSessions);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isPasskeyOpen, setIsPasskeyOpen] = useState(false);
  const accountEmail = generalSession?.account.email;
  const participantContestSections = accountContestSections.map((section) => ({
    ...section,
    contests: sortContestsByRecentDate(
      generalSession?.participantContests.filter(
        (item) => sectionKeyForContest(item.contest) === section.key,
      ) ?? [],
    ),
  }));

  async function handleLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      if (generalSession?.accessToken) {
        await logoutGeneral(
          generalSession.accessToken,
          generalSession.refreshToken,
        );
      }
    } catch {
      // Keep local cleanup reliable even when server-side revoke fails.
    } finally {
      setIsAccountPanelOpen(false);
      setIsLogoutConfirmOpen(false);
      await queryClient.cancelQueries();
      queryClient.clear();
      navigate('/', { replace: true });
      clearSessions();
      setIsLoggingOut(false);
    }
  }

  if (!generalSession) {
    return (
      <Link
        aria-label={headerText.login}
        className="header-action"
        to={loginTo}
      >
        <HeaderIcon name="user" />
        <span className="header-action-label">{headerText.login}</span>
      </Link>
    );
  }

  return (
    <>
      {isServiceMaster(generalSession) ? (
        <Link
          aria-label={headerText.admin}
          className="header-action"
          to="/admin"
        >
          <HeaderIcon name="admin" />
          <span className="header-action-label">{headerText.admin}</span>
        </Link>
      ) : null}
      <HeaderNotifications />
      <button
        aria-label="내 정보"
        aria-expanded={isAccountPanelOpen}
        aria-haspopup="dialog"
        className="header-action"
        onClick={() => setIsAccountPanelOpen(true)}
        type="button"
      >
        <HeaderIcon name="user" />
        <span className="header-action-label">내 정보</span>
      </button>
      {isAccountPanelOpen ? (
        <HeaderPanel
          id="account-panel-title"
          title="내 정보"
          label="MY ACCOUNT"
          icon="user"
          description="계정 정보와 참가 중인 대회를 확인합니다."
          onClose={() => setIsAccountPanelOpen(false)}
          footer={
            <ModalButton
              className="w-full"
              disabled={isLoggingOut}
              onClick={() => setIsLogoutConfirmOpen(true)}
              type="button"
            >
              <HeaderIcon name="logout" />
              <span>
                {isLoggingOut ? headerText.loggingOut : headerText.logout}
              </span>
            </ModalButton>
          }
        >
          <div className="header-profile">
            <span className="header-profile-avatar">
              <HeaderIcon name="user" />
            </span>
            <div>
              <small>로그인한 계정</small>
              <p>{accountEmail}</p>
            </div>
          </div>
          <button
            type="button"
            className="header-security-card"
            onClick={() => {
              setIsAccountPanelOpen(false);
              setIsPasswordOpen(true);
            }}
          >
            <span className="header-security-icon" aria-hidden="true">
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
            <span>
              <strong>비밀번호 관리</strong>
              <small>이메일 인증 후 비밀번호 등록·변경</small>
            </span>
            <span className="header-security-arrow" aria-hidden="true">
              <InterfaceIcon name="arrowRight" />
            </span>
          </button>
          <button
            type="button"
            className="header-security-card"
            onClick={() => {
              setIsAccountPanelOpen(false);
              setIsPasskeyOpen(true);
            }}
          >
            <span className="header-security-icon" aria-hidden="true">
              <HeaderIcon name="user" />
            </span>
            <span>
              <strong>패스키 관리</strong>
              <small>기기 인증으로 로그인 · 패스키 추가·삭제</small>
            </span>
            <span className="header-security-arrow" aria-hidden="true">
              <InterfaceIcon name="arrowRight" />
            </span>
          </button>
          <section className="header-panel-section">
            <div className="header-section-heading">
              <h3>내가 참가한 대회</h3>
              <span>{generalSession.participantContests.length}개</span>
            </div>
            {participantContestSections.map((section) =>
              section.contests.length ? (
                <section className="header-panel-section" key={section.key}>
                  <div className="header-section-heading">
                    <h4>{section.title}</h4>
                    <span>{section.contests.length}</span>
                  </div>
                  {section.contests.map((item) => (
                    <Link
                      className="header-contest-card"
                      key={item.contest.contest_id}
                      onClick={() => setIsAccountPanelOpen(false)}
                      to={`/contests/${item.contest.contest_id}`}
                    >
                      <strong>{item.contest.title}</strong>
                      <span>
                        {item.division.name} · {item.team.team_name}
                      </span>
                      <small>
                        {formatContestMoment(item.contest.start_at)} ~{' '}
                        {formatContestMoment(item.contest.end_at)}
                      </small>
                    </Link>
                  ))}
                </section>
              ) : null,
            )}
            {!generalSession.participantContests.length ? (
              <div className="header-empty">
                <span>
                  <HeaderIcon name="contest" />
                </span>
                <strong>참가 중인 대회가 없습니다.</strong>
                <p>대회에 참가자로 등록되면 여기에 표시됩니다.</p>
              </div>
            ) : null}
          </section>
        </HeaderPanel>
      ) : null}
      {isPasskeyOpen && (
        <PasskeyDialog
          key={generalSession.account.email}
          token={generalSession.accessToken}
          email={accountEmail || ''}
          onClose={() => setIsPasskeyOpen(false)}
        />
      )}
      {isPasswordOpen && (
        <AccountPasswordDialog
          mode="set"
          email={accountEmail || ''}
          token={generalSession.accessToken}
          onClose={() => setIsPasswordOpen(false)}
          onDone={() => {
            setIsPasswordOpen(false);
            queryClient.clear();
            clearSessions();
            navigate('/login?password=changed', { replace: true });
          }}
        />
      )}
      {isLogoutConfirmOpen ? (
        <ModalDialog
          titleId="logout-confirm-title"
          title={headerText.logoutConfirmTitle}
          icon={<HeaderIcon name="logout" />}
          onClose={
            isLoggingOut ? undefined : () => setIsLogoutConfirmOpen(false)
          }
          footer={
            <>
              <ModalButton
                disabled={isLoggingOut}
                onClick={() => setIsLogoutConfirmOpen(false)}
              >
                {headerText.logoutCancel}
              </ModalButton>
              <ModalButton
                tone="primary"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
              >
                {isLoggingOut
                  ? headerText.loggingOut
                  : headerText.logoutConfirm}
              </ModalButton>
            </>
          }
        >
          <p className="zoj-modal-copy">
            {headerText.logoutConfirmDescription}
          </p>
        </ModalDialog>
      ) : null}
    </>
  );
}
