import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import { ManagementPanel } from '@/components/common/ManagementCards';
import { accessText } from '@/data/uiText';
import { isServiceMaster } from '@/domains/identityAccess/permissions';
import type { StaffSession } from '@/domains/identityAccess/types';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import './AdminConsole.css';

const adminGroups = [
  {
    label: '워크스페이스',
    items: [
      { label: '대시보드', path: '/admin', icon: DashboardIcon, end: true },
      { label: '서비스 공지', path: '/admin/notices', icon: NoticeIcon },
      { label: '대회 관리', path: '/admin/contests', icon: ContestIcon },
      { label: '사용자 관리', path: '/admin/users', icon: UsersIcon },
      { label: '문의 관리', path: '/admin/inquiries', icon: NoticeIcon },
    ],
  },
  {
    label: '시스템 · 기록',
    items: [
      { label: '채점 관리', path: '/admin/judge', icon: JudgeIcon },
      { label: '운영 통계', path: '/admin/analytics', icon: AnalyticsIcon },
      { label: '운영 로그', path: '/admin/audit-logs', icon: ContestIcon },
    ],
  },
];

function UsersIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" />
    </svg>
  );
}

export function AdminAccessGate({
  children,
}: {
  children: (session: StaffSession) => ReactNode;
}) {
  const generalSession = useSessionStore((state) => state.generalSession);
  const staffSession = generalSession?.operatorSession;
  if (!staffSession || !isServiceMaster(generalSession)) {
    return (
      <PageLayout
        variant="management"
        title={
          staffSession
            ? accessText.adminNoPermissionTitle
            : accessText.adminLoginTitle
        }
        description={
          staffSession
            ? accessText.adminNoPermissionDescription
            : accessText.adminLoginDescription
        }
      >
        {staffSession ? (
          <p>{accessText.adminNoPermissionMessage}</p>
        ) : (
          <Link className="admin-action admin-action--primary" to="/login">
            {accessText.loginPageLink}
          </Link>
        )}
      </PageLayout>
    );
  }
  return children(staffSession);
}

export function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-console">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <span className="admin-brand-mark">Z</span>
          <span>
            <strong>ZOJ Admin</strong>
            <small>서비스 관리 콘솔</small>
          </span>
        </Link>
        <AdminTabs />
        <Link className="admin-public-link" to="/">
          서비스 홈페이지 <InterfaceIcon name="arrowUpRight" />
        </Link>
      </aside>
      <div className="admin-workspace">
        <header className="admin-page-header">
          <div>
            <p className="admin-breadcrumb">
              <Link to="/admin">관리자 콘솔</Link>
              <span>/</span>
              <span>{title}</span>
            </p>
            <h1>{title}</h1>
            {description ? (
              <p className="admin-page-description">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="admin-page-actions">{actions}</div> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

export function AdminTabs() {
  return (
    <nav aria-label="관리자 메뉴" className="admin-navigation">
      {adminGroups.map((group) => (
        <div className="admin-navigation-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                end={'end' in tab && tab.end}
                to={tab.path}
                className={({ isActive }) =>
                  ['admin-navigation-link', isActive && 'is-active']
                    .filter(Boolean)
                    .join(' ')
                }
              >
                <Icon />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminSectionTabs({
  items,
  label = '작업 메뉴',
}: {
  label?: string;
  items: { label: string; value: string }[];
}) {
  return (
    <nav className="admin-section-tabs" aria-label={label}>
      {items.map((item) => (
        <NavLink
          to={item.value}
          key={item.value}
          end
          className={({ isActive }) =>
            ['admin-section-link', isActive && 'is-active']
              .filter(Boolean)
              .join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminViewTabs<T extends string>({
  items,
  value,
  onChange,
  label = '작업 메뉴',
}: {
  items: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="admin-section-tabs" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          aria-pressed={value === item.value}
          key={item.value}
          className={['admin-section-link', value === item.value && 'is-active']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function AdminPanel(props: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return <ManagementPanel {...props} />;
}

type AdminAccent = 'violet' | 'amber' | 'emerald' | 'rose' | 'slate';
export function AdminIconBadge({
  children,
  tone = 'violet',
}: {
  children: ReactNode;
  tone?: AdminAccent;
}) {
  return <span className={`admin-icon-badge is-${tone}`}>{children}</span>;
}
export function AdminMetricCard({
  accent = 'violet',
  description,
  icon,
  label,
  value,
}: {
  accent?: AdminAccent;
  description?: ReactNode;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <article className="admin-metric">
      <div className="admin-metric-heading">
        <span>{label}</span>
        <AdminIconBadge tone={accent}>{icon}</AdminIconBadge>
      </div>
      <strong>{value}</strong>
      {description ? <p>{description}</p> : null}
    </article>
  );
}

export function DashboardIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M3.5 4.5a1 1 0 0 1 1-1h4v5h-5v-4ZM11.5 3.5h4a1 1 0 0 1 1 1v2h-5v-3ZM3.5 11.5h5v5h-4a1 1 0 0 1-1-1v-4ZM11.5 9.5h5v6a1 1 0 0 1-1 1h-4v-7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function ContestIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M5 4.5h10M5 8h10M5 11.5h6M5 15h4M3.5 2.75h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function JudgeIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M6.5 14.5h7M8 17h4M10 2.5v3M5.5 6.5 4 5M14.5 6.5 16 5M5.5 10a4.5 4.5 0 1 1 9 0c0 1.8-.92 2.72-1.72 3.52-.48.48-.91.91-1.03 1.48h-3.5c-.12-.57-.55-1-1.03-1.48C6.42 12.72 5.5 11.8 5.5 10Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function NoticeIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M4 12.5V7.75A3.75 3.75 0 0 1 7.75 4h4.5A3.75 3.75 0 0 1 16 7.75v4.75l1.25 2H2.75l1.25-2ZM8.25 16.5h3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function AnalyticsIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M3 3v14h14M6 13V9m4 4V5m4 8V7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
