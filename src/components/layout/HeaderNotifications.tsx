import InterfaceIcon from '@/components/common/InterfaceIcon';
import HeaderPanel, {
  HeaderIcon,
  type HeaderIconName,
} from '@/components/layout/HeaderPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useMatch, useNavigate } from 'react-router-dom';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  getNotifications,
  updateNotification,
  readAllNotifications,
} from '@/domains/serviceCommunication/notifications';
import { formatDateTime } from '@/shared/lib/dateTime';

type HeaderNotificationType = 'answer' | 'notice' | 'submission' | 'rejudging';
type HeaderNotification = {
  id: string;
  type: HeaderNotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt?: string;
  dismissedAt?: string;
  reason?: string;
};

function formatNotificationAge(value: string, now: number) {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return '-';

  const diffSeconds = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}초전`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 10) return `${diffHours}시간전`;

  return formatDateTime(value);
}

const notificationLabels: Record<HeaderNotificationType, string> = {
  notice: '대회 공지',
  answer: '질문 답변',
  submission: '채점 결과',
  rejudging: '재채점 결과 변경',
};
const notificationIcons: Record<HeaderNotificationType, HeaderIconName> = {
  notice: 'bell',
  answer: 'answer',
  submission: 'submission',
  rejudging: 'submission',
};

function NotificationContent({
  notification,
  now,
}: {
  notification: HeaderNotification;
  now: number;
}) {
  return (
    <>
      <span className="header-notification-icon" data-type={notification.type}>
        <HeaderIcon name={notificationIcons[notification.type]} />
      </span>
      <span className="header-notification-content">
        <span className="header-notification-meta">
          {notificationLabels[notification.type]}
          {!notification.readAt ? (
            <>
              <i aria-hidden="true" />
              <span className="header-notification-unread">읽지 않음</span>
            </>
          ) : null}
        </span>
        <strong>{notification.title}</strong>
        <span>{notification.body}</span>
        {notification.reason ? (
          <span className="header-notification-reason">
            사유: {notification.reason}
          </span>
        ) : null}
        <time dateTime={notification.createdAt}>
          {formatNotificationAge(notification.createdAt, now)}
        </time>
      </span>
    </>
  );
}

export default function HeaderNotifications() {
  const navigate = useNavigate();
  const nested = useMatch('/contests/:contestId/*');
  const exact = useMatch('/contests/:contestId');
  const contestId = (nested ?? exact)?.params.contestId ?? '';
  const {
    generalSession,
    participantSession,
    activeParticipantSession,
    isPreview,
  } = useContestParticipantSession(contestId);
  const token =
    generalSession?.accessToken ??
    (!participantSession?.isPreview
      ? participantSession?.accessToken
      : undefined) ??
    (!isPreview && !activeParticipantSession?.isPreview
      ? activeParticipantSession?.accessToken
      : undefined);
  const scope = generalSession
    ? undefined
    : (participantSession?.contestId ?? contestId);
  const [now, setNow] = useState(() => Date.now());
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['notifications', tokenQueryIdentity(token), scope ?? 'all'];
  const inboxIdentity = JSON.stringify(queryKey);
  const autoReadRequest = useRef<string | null>(null);
  const query = useInfiniteQuery({
    enabled: Boolean(token),
    queryKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getNotifications(token!, scope, pageParam),
    getNextPageParam: (page) => page.next_offset ?? undefined,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id?: string;
      action: 'read' | 'unread' | 'dismiss' | 'delete' | 'read-all';
    }) => {
      if (action === 'read-all') await readAllNotifications(token!, scope);
      else await updateNotification(token!, id!, action, scope);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const mutateNotification = update.mutate;
  const notifications = useMemo<HeaderNotification[]>(
    () =>
      !token
        ? []
        : [
            ...new Map(
              (query.data?.pages.flatMap((page) => page.items) ?? []).map(
                (item) => [item.notification_id, item],
              ),
            ).values(),
          ].map((item) => ({
            id: item.notification_id,
            type: item.notification_type,
            title: `${item.contest_title} · ${item.title}`,
            body: item.body,
            href: item.href,
            createdAt: item.created_at,
            readAt: item.read_at ?? undefined,
            dismissedAt: item.dismissed_at ?? undefined,
            reason: item.reason ?? undefined,
          })),
    [token, query.data],
  );
  const unreadCount = token ? (query.data?.pages[0]?.unread_count ?? 0) : 0;
  const toasts = notifications.filter(
    (item) => !item.readAt && !item.dismissedAt,
  );

  useEffect(() => {
    // The previous inbox was shared by every account using this browser.
    // Do not import those private bodies into the authenticated server inbox.
    window.localStorage.removeItem('zoj.headerNotifications.v1');
  }, []);
  useEffect(() => {
    if (!notifications.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [notifications.length]);

  function openPanel() {
    autoReadRequest.current = token ? inboxIdentity : null;
    setIsPanelOpen(true);
  }

  useEffect(() => {
    // Mark once per opening, after a successful load. Polling/new arrivals and
    // manual unread changes must not repeatedly trigger a bulk read request.
    if (autoReadRequest.current !== inboxIdentity) {
      autoReadRequest.current = null;
      return;
    }
    if (isPanelOpen && token && query.isSuccess) {
      autoReadRequest.current = null;
      mutateNotification({ action: 'read-all' });
    }
  }, [inboxIdentity, isPanelOpen, token, query.isSuccess, mutateNotification]);

  async function openNotification(notification: HeaderNotification) {
    try {
      if (!notification.readAt)
        await update.mutateAsync({ id: notification.id, action: 'read' });
      setIsPanelOpen(false);
      navigate(notification.href);
    } catch {
      /* Keep the item visible when the server cannot save its state. */
    }
  }

  return (
    <>
      {update.isError ? (
        <p role="alert" className="header-notification-error">
          알림 상태를 저장하지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <button
        aria-label="알림"
        aria-expanded={isPanelOpen}
        aria-haspopup="dialog"
        className="header-action"
        onClick={openPanel}
        type="button"
      >
        <HeaderIcon name="bell" />
        <span className="header-action-label">알림</span>
        {unreadCount ? (
          <span className="header-action-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      {toasts.length && !isPanelOpen ? (
        <div className="header-toast-stack" aria-label="새 알림">
          {toasts.slice(0, 3).map((item) => (
            <article className="header-toast" key={item.id}>
              <button onClick={() => void openNotification(item)} type="button">
                <NotificationContent notification={item} now={now} />
              </button>
              <button
                aria-label="알림 닫기"
                className="header-icon-button"
                onClick={() =>
                  update.mutate({ id: item.id, action: 'dismiss' })
                }
                type="button"
              >
                <HeaderIcon name="close" />
              </button>
            </article>
          ))}
          {toasts.length > 3 ? (
            <button
              className="header-toast-more"
              type="button"
              onClick={openPanel}
            >
              새 알림 {toasts.length}개 모두 보기{' '}
              <InterfaceIcon name="arrowUpRight" />
            </button>
          ) : null}
        </div>
      ) : null}
      {isPanelOpen ? (
        <HeaderPanel
          id="notification-panel-title"
          title="알림"
          label="NOTIFICATIONS"
          icon="bell"
          description="대회 소식부터 내 질문의 답변, 채점 결과까지. 계정에 저장된 알림입니다."
          onClose={() => setIsPanelOpen(false)}
        >
          {query.isError && token ? (
            <p role="alert">
              알림을 불러오지 못했습니다.{' '}
              <button type="button" onClick={() => void query.refetch()}>
                다시 시도
              </button>
            </p>
          ) : null}
          {token && query.isPending ? (
            <p role="status">알림을 불러오는 중…</p>
          ) : notifications.length ? (
            <>
              <div className="header-section-heading">
                <h3>받은 알림</h3>
                <span>읽지 않은 알림 {unreadCount}개</span>
                <button
                  className="header-notification-read-all"
                  disabled={!unreadCount || update.isPending}
                  onClick={() => update.mutate({ action: 'read-all' })}
                  type="button"
                >
                  모두 읽음
                </button>
              </div>
              <ul className="header-notification-list">
                {notifications.map((item) => (
                  <li
                    className={`header-notification-card ${item.readAt ? 'is-read' : ''}`}
                    key={item.id}
                  >
                    <button
                      className="header-notification-open"
                      onClick={() => void openNotification(item)}
                      type="button"
                    >
                      <NotificationContent notification={item} now={now} />
                    </button>
                    <div className="header-notification-actions">
                      <button
                        className="header-notification-read"
                        aria-label={`${item.title} ${item.readAt ? '읽지 않음으로 표시' : '읽음으로 표시'}`}
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: item.id,
                            action: item.readAt ? 'unread' : 'read',
                          })
                        }
                        type="button"
                      >
                        {item.readAt ? '읽음' : '읽음 표시'}
                      </button>
                      <button
                        aria-label={`${item.title} 알림 삭제`}
                        className="header-icon-button header-notification-remove"
                        onClick={() =>
                          update.mutate({ id: item.id, action: 'delete' })
                        }
                        title="알림 삭제"
                        type="button"
                      >
                        <HeaderIcon name="close" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {query.hasNextPage ? (
                <button
                  className="header-toast-more"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  type="button"
                >
                  {query.isFetchingNextPage
                    ? '불러오는 중…'
                    : '이전 알림 더 보기'}
                </button>
              ) : null}
            </>
          ) : !query.isError || !token ? (
            <div className="header-empty">
              <span>
                <HeaderIcon name="bell" />
              </span>
              <strong>
                {token
                  ? '아직 도착한 알림이 없어요.'
                  : '로그인하면 내 알림을 확인할 수 있어요.'}
              </strong>
              <p>
                새로운 소식이 생기면
                <br />
                이곳에 차곡차곡 모아 드릴게요.
              </p>
            </div>
          ) : null}
        </HeaderPanel>
      ) : null}
    </>
  );
}
