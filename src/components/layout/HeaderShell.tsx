import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import SiteBrand from '@/components/layout/SiteBrand';
import Modal from '@/shared/ui/Modal';
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
  const [menu, setMenu] = useState<{
    locationKey: string;
    closing: boolean;
  } | null>(null);
  const menuOpen = menu?.locationKey === location.key;
  const closing = menuOpen && menu.closing;
  const menuId = useId();

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenu(null);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!closing) return;
    // Ensure dismissal also completes if an animation is interrupted.
    const timeout = window.setTimeout(() => setMenu(null), 260);
    return () => window.clearTimeout(timeout);
  }, [closing]);

  function closeMenu() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setMenu(null);
    } else {
      setMenu((current) => current && { ...current, closing: true });
    }
  }

  function links() {
    return navItems.map((item) => (
      <li key={item.key}>
        <NavLink
          onClick={() => setMenu(null)}
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
          aria-expanded={menuOpen && !closing}
          aria-controls={menuOpen ? menuId : undefined}
          aria-haspopup="dialog"
          onClick={() => setMenu({ locationKey: location.key, closing: false })}
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
        <Modal aria-label="메뉴" onClose={closeMenu} drawer>
          <section
            className="zoj-modal-shell site-menu-drawer"
            data-state={closing ? 'closing' : 'open'}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === 'site-menu-slide-out'
              )
                setMenu(null);
            }}
          >
            <header className="site-menu-drawer__header">
              <Link
                to="/"
                aria-label="Zerone Online Judge 홈"
                className="site-header-brand"
                onClick={() => setMenu(null)}
              >
                <SiteBrand />
              </Link>
              <button
                type="button"
                className="site-menu-drawer__close"
                aria-label="메뉴 닫기"
                onClick={closeMenu}
                disabled={closing}
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
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <nav id={menuId} aria-label={ariaLabel} className="site-mobile-nav">
              <ul>{links()}</ul>
            </nav>
          </section>
        </Modal>
      )}
    </header>
  );
}
