import { BrowserRouter } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import AppProviders from '@/app/providers/AppProviders';
import SessionExpiryRedirector from '@/app/providers/SessionExpiryRedirector';
import Layout from '@/components/layout/Layout';
import AppRoutes from '@/routes/AppRoutes';
import ChangeNoticeDialog from '@/components/operator/ChangeNoticeDialog';

export default function App() {
  useLayoutEffect(() => {
    // The HTML loading notice stays until React has committed its first frame.
    document.dispatchEvent(new Event('zoj:app-ready'));
  }, []);

  return (
    <BrowserRouter>
      <AppProviders>
        <SessionExpiryRedirector />
        <ChangeNoticeDialog />
        <Layout>
          <AppRoutes />
        </Layout>
      </AppProviders>
    </BrowserRouter>
  );
}
