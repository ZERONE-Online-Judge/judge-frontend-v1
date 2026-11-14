import { useCallback, useEffect, useMemo, useRef } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  createOperatorTestSubmission,
  waitOperatorTestSubmissionStatus,
} from '@/domains/submissionScoreboard/api';
import { isSubmissionPending } from '@/domains/submissionScoreboard/status';
import type {
  JudgeLanguage,
  Submission,
} from '@/domains/submissionScoreboard/types';
import { formatUserApiError } from '@/shared/api/errors';

export type ProblemReviewRun = {
  id: string;
  problemId: string;
  language: JudgeLanguage;
  sourceCode: string;
  startedAt: string;
  phase: 'submitting' | 'judging' | 'done' | 'error';
  submission?: Submission;
  error?: string;
};

export function isReviewRunPending(run: ProblemReviewRun) {
  return run.phase === 'submitting' || run.phase === 'judging';
}

function createReviewContext(historyKey: string[]) {
  let mounted = false;
  return {
    historyKey,
    activeProblems: new Set<string>(),
    isMounted: () => mounted,
    mount: () => {
      mounted = true;
    },
    unmount: () => {
      mounted = false;
    },
  };
}

/** Keep this browser session's review history across operator route changes. */
export default function useProblemReviewRuns(contestId: string, token: string) {
  const client = useQueryClient();
  const identity = tokenQueryIdentity(token);
  const historyKey = useMemo(
    () => ['operator', 'problem-review-runs', contestId, identity],
    [contestId, identity],
  );
  const { data: runs = [] } = useQuery<ProblemReviewRun[]>({
    queryKey: historyKey,
    // The existing submission APIs supply each run. This query only observes
    // their shared cache; mounting this screen must never create a submission.
    queryFn: skipToken,
    initialData: [],
    gcTime: Infinity,
    placeholderData: () => undefined,
  });
  const context = useMemo(() => createReviewContext(historyKey), [historyKey]);
  const latestToken = useRef(token);

  useEffect(() => {
    latestToken.current = token;
  }, [token]);

  useEffect(() => {
    context.mount();
    return () => {
      context.unmount();
    };
  }, [context]);

  const update = useCallback(
    (id: string, patch: Partial<ProblemReviewRun>) => {
      client.setQueryData<ProblemReviewRun[]>(historyKey, (previous) =>
        // A logout/cache clear must not be undone by a late network response.
        previous?.some((run) => run.id === id)
          ? previous.map((run) => (run.id === id ? { ...run, ...patch } : run))
          : undefined,
      );
    },
    [client, historyKey],
  );

  const process = useCallback(
    async (run: ProblemReviewRun) => {
      if (context.activeProblems.has(run.problemId)) return;
      context.activeProblems.add(run.problemId);
      let posting = !run.submission;
      try {
        let submission = run.submission;
        if (!submission) {
          submission = await createOperatorTestSubmission(
            contestId,
            run.problemId,
            latestToken.current,
            { language: run.language, source_code: run.sourceCode },
          );
          posting = false;
          // The POST can finish after navigation. Retain its server ID so the
          // returning screen can check that job, without posting the code again.
          update(run.id, {
            submission,
            phase: isSubmissionPending(submission.status) ? 'judging' : 'done',
            error: undefined,
          });
        }
        while (context.isMounted()) {
          const pending = isSubmissionPending(submission.status);
          update(run.id, {
            submission,
            phase: pending ? 'judging' : 'done',
            error: undefined,
          });
          if (!pending) break;
          const requestToken = latestToken.current;
          try {
            submission = await waitOperatorTestSubmissionStatus(
              contestId,
              submission.submission_id,
              requestToken,
              { waitSeconds: 1, pollIntervalSeconds: 0.25 },
            );
          } catch (error) {
            // A refreshed token can check the same job. A POST is never retried.
            if (requestToken !== latestToken.current && context.isMounted())
              continue;
            throw error;
          }
          if (context.isMounted() && isSubmissionPending(submission.status))
            await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      } catch (error) {
        // An abandoned poll must not overwrite a newer result from the screen
        // that has since reopened. An unresolved POST still needs its error saved.
        if (context.isMounted() || posting)
          update(run.id, {
            phase: 'error',
            error: formatUserApiError(
              error,
              '검수 채점 요청을 처리하지 못했습니다.',
            ),
          });
      } finally {
        context.activeProblems.delete(run.problemId);
      }
    },
    [contestId, context, update],
  );

  useEffect(() => {
    for (const run of runs) {
      // Failed requests remain explicit retries. A request with no server ID may
      // still be in flight in the previous screen, so it must never be reposted.
      if (
        run.phase === 'judging' &&
        run.submission &&
        isSubmissionPending(run.submission.status)
      )
        void process(run);
    }
  }, [runs, process]);

  function submit(
    problemId: string,
    language: JudgeLanguage,
    sourceCode: string,
  ) {
    if (
      !sourceCode.trim() ||
      context.activeProblems.has(problemId) ||
      runs.some((run) => run.problemId === problemId && isReviewRunPending(run))
    )
      return;
    const run: ProblemReviewRun = {
      id: crypto.randomUUID(),
      problemId,
      language,
      sourceCode,
      startedAt: new Date().toISOString(),
      phase: 'submitting',
    };
    client.setQueryData<ProblemReviewRun[]>(historyKey, (previous = []) => [
      run,
      ...previous,
    ]);
    void process(run);
  }

  function resume(run: ProblemReviewRun) {
    if (
      !run.submission ||
      !isSubmissionPending(run.submission.status) ||
      context.activeProblems.has(run.problemId)
    )
      return;
    update(run.id, { phase: 'judging', error: undefined });
    void process(run);
  }

  return { runs, submit, resume };
}
