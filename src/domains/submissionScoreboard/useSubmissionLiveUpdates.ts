import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiClientError } from '@/shared/api/errors';
import {
  mergeSubmissionUpdates,
  needsSubmissionLiveUpdate,
} from './liveSubmissions';
import type { Submission } from './types';

/** A separate query lets live rows update without restarting the list timer. */
export function useSubmissionLiveUpdates({
  submissions,
  listUpdatedAt,
  scope,
  enabled,
  waitForUpdates,
}: {
  submissions: Submission[];
  listUpdatedAt: number;
  scope: string;
  enabled: boolean;
  waitForUpdates: (ids: string[], signal: AbortSignal) => Promise<Submission[]>;
}) {
  const queryClient = useQueryClient();
  const ids = submissions
    .filter(needsSubmissionLiveUpdate)
    .map((item) => item.submission_id)
    .sort()
    .join(',');
  const queryKey = useMemo(
    () => ['submission-live', scope, listUpdatedAt, ids],
    [scope, listUpdatedAt, ids],
  );
  const liveQuery = useQuery({
    queryKey,
    enabled: enabled && Boolean(ids),
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<Submission[]>(queryKey);
      const current = previous ?? submissions.filter(needsSubmissionLiveUpdate);
      const pending = current
        .filter(needsSubmissionLiveUpdate)
        .map((item) => item.submission_id);
      if (!pending.length) return current;
      const updates = await waitForUpdates(pending, signal);
      return mergeSubmissionUpdates(current, updates);
    },
    // Never carry results across filters, pages, roles, sessions or list refreshes.
    placeholderData: undefined,
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
    refetchInterval: (query) => {
      if (!enabled || !ids) return false;
      if (
        isApiClientError(query.state.error) &&
        [401, 403, 404].includes(query.state.error.status)
      )
        return false;
      if (query.state.error) return 3_000;
      return (query.state.data ?? submissions).some(needsSubmissionLiveUpdate)
        ? 100
        : false;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled) void queryClient.cancelQueries({ queryKey, exact: true });
  }, [enabled, queryClient, queryKey]);

  return mergeSubmissionUpdates(submissions, liveQuery.data);
}
