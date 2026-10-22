import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminLayout,
  AdminMetricCard,
  AdminPanel,
  DashboardIcon,
  ContestIcon,
  JudgeIcon,
  NoticeIcon,
  AnalyticsIcon,
} from '@/components/admin/AdminShell';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { getAdminDashboard } from '@/domains/auditMonitoring/api';
import {
  listAdminServiceNotices,
  listAdminContactInquiries,
} from '@/domains/serviceCommunication/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';

const shortcuts = [
  {
    title: '공지 작성',
    description: '서비스 안내를 작성하고 발행합니다.',
    to: '/admin/notices/new',
    Icon: NoticeIcon,
  },
  {
    title: '대회 생성',
    description: '새 대회를 만들고 초기 운영자를 배정합니다.',
    to: '/admin/contests?view=create',
    Icon: ContestIcon,
  },
  {
    title: '채점 인프라',
    description: '채점 노드의 연결 상태와 작업을 확인합니다.',
    to: '/admin/judge',
    Icon: JudgeIcon,
  },
  {
    title: '운영 통계',
    description: '방문 흐름과 대회 이용 현황을 살펴봅니다.',
    to: '/admin/analytics',
    Icon: AnalyticsIcon,
  },
];
export default function AdminHomePage() {
  return (
    <AdminAccessGate>
      {(session) => <AdminHomeContent token={session.accessToken} />}
    </AdminAccessGate>
  );
}
function AdminHomeContent({ token }: { token: string }) {
  const visible = useDocumentVisibility();
  const identity = tokenQueryIdentity(token);
  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard', identity],
    queryFn: () => getAdminDashboard(token),
    refetchInterval: visible ? 15000 : false,
  });
  const noticesQuery = useQuery({
    queryKey: ['admin', 'service-notices', identity],
    queryFn: () => listAdminServiceNotices(token),
    refetchInterval: visible ? 30000 : false,
  });
  const inquiriesQuery = useQuery({
    queryKey: ['admin', 'contact-inquiries', identity],
    queryFn: () => listAdminContactInquiries(token),
    refetchInterval: visible ? 30000 : false,
  });
  const dashboard = dashboardQuery.data;
  const recent = [...(noticesQuery.data ?? [])]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 5);
  const pending = (inquiriesQuery.data ?? [])
    .filter((item) => item.status !== 'answered')
    .slice(0, 5);
  return (
    <AdminLayout
      title="대시보드"
      description="서비스 운영 현황을 확인하고 필요한 작업으로 이동하세요."
      actions={
        <Link
          className="admin-action admin-action--primary"
          to="/admin/notices/new"
        >
          <InterfaceIcon name="list" />
          공지 작성
        </Link>
      }
    >
      {dashboardQuery.error && (
        <p className="admin-error" role="alert">
          {formatApiError(
            dashboardQuery.error,
            '운영 현황을 불러오지 못했습니다.',
          )}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          icon={<DashboardIcon />}
          label="전체 대회"
          value={dashboard?.contest_count ?? '—'}
          description="서비스에 등록된 대회"
        />
        <AdminMetricCard
          icon={<JudgeIcon />}
          label="대기 채점"
          value={dashboard?.pending_jobs ?? '—'}
          accent="amber"
          description="배정을 기다리는 채점 작업"
        />
        <AdminMetricCard
          icon={<JudgeIcon />}
          label="활성 채점 노드"
          value={
            dashboard
              ? `${dashboard.active_judge_node_count ?? '—'} / ${dashboard.judge_node_count}`
              : '—'
          }
          accent="emerald"
          description="활성 노드 / 등록된 전체 노드"
        />
        <AdminMetricCard
          icon={<NoticeIcon />}
          label="대기 메일"
          value={dashboard?.mail_queue_pending ?? '—'}
          accent="slate"
          description="발송을 기다리는 메일"
        />
      </div>
      <AdminPanel title="자주 하는 작업">
        <div className="admin-overview-links">
          {shortcuts.map(({ title, description, to, Icon }) => (
            <Link to={to} key={to} className="admin-overview-link">
              <span className="admin-icon-badge">
                <Icon />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <InterfaceIcon name="arrowRight" />
            </Link>
          ))}
        </div>
      </AdminPanel>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="최근 서비스 공지"
          actions={
            <Link className="admin-action" to="/admin/notices">
              전체 보기
            </Link>
          }
        >
          {noticesQuery.error ? (
            <p className="admin-error" role="alert">
              {formatApiError(
                noticesQuery.error,
                '공지 목록을 불러오지 못했습니다.',
              )}
            </p>
          ) : recent.length ? (
            <div className="admin-recent-list">
              {recent.map((notice) => (
                <Link
                  key={notice.service_notice_id}
                  to={`/admin/notices?notice=${encodeURIComponent(notice.service_notice_id)}`}
                >
                  <span
                    className={[
                      'admin-pill',
                      notice.emergency && 'admin-pill--urgent',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {notice.emergency ? '긴급' : '일반'}
                  </span>
                  <div>
                    <strong>{notice.title}</strong>
                    <time dateTime={notice.published_at}>
                      {formatDateTime(notice.published_at)}
                    </time>
                  </div>
                  <InterfaceIcon name="arrowRight" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="admin-empty">
              {noticesQuery.isPending
                ? '공지 목록을 불러오는 중입니다.'
                : '발행한 공지가 없습니다.'}
            </p>
          )}
        </AdminPanel>
        <AdminPanel
          title="답변이 필요한 문의"
          actions={
            <Link className="admin-action" to="/admin/inquiries?view=pending">
              문의 관리
            </Link>
          }
        >
          {inquiriesQuery.error ? (
            <p className="admin-error" role="alert">
              {formatApiError(
                inquiriesQuery.error,
                '문의 목록을 불러오지 못했습니다.',
              )}
            </p>
          ) : pending.length ? (
            <div className="admin-recent-list">
              {pending.map((inquiry) => (
                <Link
                  key={inquiry.contact_inquiry_id}
                  to="/admin/inquiries?view=pending"
                >
                  <span className="admin-icon-badge is-amber">
                    <InterfaceIcon name="mail" />
                  </span>
                  <div>
                    <strong>{inquiry.title}</strong>
                    <time dateTime={inquiry.created_at}>
                      {formatDateTime(inquiry.created_at)}
                    </time>
                  </div>
                  <InterfaceIcon name="arrowRight" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="admin-empty">
              {inquiriesQuery.isPending
                ? '문의 목록을 불러오는 중입니다.'
                : '답변이 필요한 문의가 없습니다.'}
            </p>
          )}
        </AdminPanel>
      </div>
    </AdminLayout>
  );
}
