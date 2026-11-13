import ScoreboardReleaseView from '@/components/operator/ScoreboardReleaseView';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getScoreboardRelease,
  updateScoreboardRelease,
} from '@/domains/submissionScoreboard/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { notifyScoreboardUpdate } from '@/domains/submissionScoreboard/presentationSync';
import type {
  ContestScoringMode,
  ScoreboardReleaseMode,
} from '@/domains/contestAdministration/types';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import type { ScoreboardReleaseAction } from '@/domains/submissionScoreboard/types';

export default function ScoreboardReleaseControl({
  contestId,
  divisionId,
  divisionName,
  token,
  strategy = 'manual',
  scoringMode,
}: {
  contestId: string;
  divisionId: string;
  divisionName: string;
  token: string;
  strategy?: ScoreboardReleaseMode;
  scoringMode?: ContestScoringMode;
}) {
  const client = useQueryClient();
  const isVisible = useDocumentVisibility();
  const queryKey = [
    'operator',
    'scoreboard-release',
    contestId,
    divisionId,
    strategy,
    tokenQueryIdentity(token),
  ];
  const query = useQuery({
    queryKey,
    queryFn: () => getScoreboardRelease(contestId, divisionId, token),
    refetchInterval: isVisible ? 2000 : false,
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: (body: ScoreboardReleaseAction) =>
      updateScoreboardRelease(contestId, divisionId, token, body),
    onSuccess: (data) => {
      client.setQueryData(queryKey, data);
      void client.invalidateQueries({ queryKey: ['operator', 'scoreboard'] });
      void client.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
      notifyScoreboardUpdate(contestId);
    },
    onError: () => {
      // Refresh after conflicts with another operator's reveal or undo.
      void client.invalidateQueries({ queryKey });
    },
  });
  return (
    <ScoreboardReleaseView
      release={query.data}
      scoringMode={scoringMode}
      strategy={strategy}
      divisionName={divisionName}
      pending={mutation.isPending}
      pendingAction={mutation.variables?.action}
      error={query.error || mutation.error}
      publish={(body) =>
        mutation.mutate({
          ...body,
          ...(query.data?.revision === undefined
            ? {}
            : { expected_revision: query.data.revision }),
        })
      }
    />
  );
}
