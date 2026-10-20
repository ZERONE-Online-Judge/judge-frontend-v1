import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import SiteBrand from '@/components/layout/SiteBrand';
import ModalDialog from '@/shared/ui/ModalDialog';
import './HeaderShell.css';

export type HeaderNavItem = {
  activeClassName?: string;
  key: string;
  label: string;
  badge?: string;
  to: string;
  end?: boolean;
};

type HeaderShellProps = {
  actions: ReactNode;
  ariaLabel: string;
  navItems: HeaderNavItem[];
};

export default function HeaderShell({
  actions,
  ariaLabel,
  navItems,
}: HeaderShellProps) {
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const menuOpen = openedAt === location.key;
  const menuId = useId();

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpenedAt(null);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  function links() {
    return navItems.map((item) => (
      <li key={item.key}>
        <NavLink
          onClick={() => setOpenedAt(null)}
          className={({ isActive }) =>
            [
              isActive ? 'is-active' : '',
              isActive ? (item.activeClassName ?? '') : '',
            ].join(' ')
          }
          end={item.end}
          to={item.to}
        >
          <span>{item.label}</span>
          {item.badge && <span className="site-nav-badge">{item.badge}</span>}
        </NavLink>
      </li>
    ));
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link
          aria-label="Zerone Online Judge 홈"
          className="site-header-brand"
          to="/"
        >
          <SiteBrand />
        </Link>
        <nav aria-label={ariaLabel} className="site-desktop-nav">
          <ul>{links()}</ul>
        </nav>
        <div className="site-header-actions">{actions}</div>
        <button
          type="button"
          className="site-menu-toggle"
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-haspopup="dialog"
          onClick={() => setOpenedAt(location.key)}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      {menuOpen && (
        <ModalDialog
          title="메뉴"
          onClose={() => setOpenedAt(null)}
          closeLabel="메뉴 닫기"
          drawer
        >
          <nav id={menuId} aria-label={ariaLabel} className="site-mobile-nav">
            <ul>{links()}</ul>
          </nav>
        </ModalDialog>
      )}
    </header>
  );
}
