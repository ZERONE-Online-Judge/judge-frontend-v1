import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import SessionRefreshProvider from '@/app/providers/SessionRefreshProvider';
import SessionSyncProvider from '@/app/providers/SessionSyncProvider';
import { isDedicatedPresentationPath } from '@/domains/presentationAccess/paths';
import { queryClient } from '@/shared/query/queryClient';

export default function AppProviders({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const presentationOnly = isDedicatedPresentationPath(pathname);
  return (
    <QueryClientProvider client={queryClient}>
      {presentationOnly ? (
        children
      ) : (
        <SessionSyncProvider>
          <SessionRefreshProvider>{children}</SessionRefreshProvider>
        </SessionSyncProvider>
      )}
    </QueryClientProvider>
  );
}
