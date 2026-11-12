import { BrowserRouter } from 'react-router-dom';
import AppProviders from '@/app/providers/AppProviders';
import SessionExpiryRedirector from '@/app/providers/SessionExpiryRedirector';
import Layout from '@/components/layout/Layout';
import AppRoutes from '@/routes/AppRoutes';
import ChangeNoticeDialog from '@/components/operator/ChangeNoticeDialog';

export default function App() {
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
