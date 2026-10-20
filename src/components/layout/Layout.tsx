import useUsageTracking from '@/domains/usageAnalytics/useUsageTracking';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import PageSeo from '@/shared/seo/PageSeo';
import PublicEasterEggs from '@/components/public/easterEggs/PublicEasterEggs';
import PasswordSetupGuidance from '@/components/auth/PasswordSetupGuidance';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();
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
      <div className="flex min-h-screen flex-col bg-white text-slate-950">
        <PageSeo />
        <Header />
        <PasswordSetupGuidance />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </PublicEasterEggs>
  );
}
