import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { isDedicatedPresentationPath } from '@/domains/presentationAccess/paths';
import { API_BASE_URL } from '@/shared/api/client';
import {
  startUsageTracking,
  usagePath,
} from '@/domains/usageAnalytics/tracker';

export default function useUsageTracking() {
  const { pathname, search } = useLocation();
  const path = usagePath(pathname, search);
  useEffect(() => {
    if (isDedicatedPresentationPath(pathname)) return;
    return startUsageTracking({
      path,
      endpoint: `${API_BASE_URL}/public/usage`,
      getToken: () => {
        const { generalSession, participantSession } =
          useSessionStore.getState();
        const contestId = path.match(/^\/contests\/([^/]+)/)?.[1];
        if (
          contestId &&
          participantSession?.contestId === contestId &&
          !participantSession.isPreview
        )
          return participantSession.accessToken;
        return generalSession?.accessToken;
      },
    });
  }, [path, pathname]);
}
