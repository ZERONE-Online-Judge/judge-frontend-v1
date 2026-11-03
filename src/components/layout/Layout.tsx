import useUsageTracking from '@/domains/usageAnalytics/useUsageTracking';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import PageSeo from '@/shared/seo/PageSeo';
import PublicEasterEggs from '@/components/public/easterEggs/PublicEasterEggs';
import PasswordSetupGuidance from '@/components/auth/PasswordSetupGuidance';
import '@/styles/ProductExperience.css';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);
  useEffect(() => {
    // Start a newly opened page at its heading, while retaining history and
    // anchor navigation behavior. Query-only filters keep their position.
    if (previousPath.current !== pathname && navigationType !== 'POP' && !hash)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    previousPath.current = pathname;
  }, [pathname, hash, navigationType]);
  useUsageTracking();
  if (
    /^\/presentation\/contests\/[^/]+\/?$/.test(pathname) ||
    /^\/operator\/contests\/[^/]+\/scoreboard\/presentation\/?$/.test(pathname)
  ) {
    return (
      <>
        <PageSeo />
        <main>{children}</main>
      </>
    );
  }

  return (
    <PublicEasterEggs>
      <div className="zoj-product flex min-h-screen flex-col bg-white text-slate-950">
        <PageSeo />
        <Header />
        <PasswordSetupGuidance />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </PublicEasterEggs>
  );
}
