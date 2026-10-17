import { useEffect, useRef, useState } from 'react';
import type { VerificationExecution } from './verificationExecution';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listVerificationRuns,
  type SavedVerificationRuns,
  type VerificationAnalysis,
} from '@/domains/problemManagement/verificationAi';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  getStorageObjectText,
  uploadProblemAsset,
} from '@/domains/problemManagement/api';
import type { ProblemAsset } from '@/domains/problemManagement/types';
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

export type VerificationCodeKind =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit_exceeded'
  | 'memory_limit_exceeded';

export type VerificationRunResult = {
  id: string;
  problemId: string;
  asset?: ProblemAsset;
  error?: string;
  expectedStatus: VerificationCodeKind;
  filename: string;
  stage: 'uploading' | 'loading_source' | 'submitting' | 'judging' | 'done';
  submission?: Submission;
  analysis?: VerificationAnalysis | null;
  stale?: boolean;
  persisted?: boolean;
  snapshotAvailable?: boolean;
  execution?: VerificationExecution | null;
};

export const VERIFICATION_CODE_KINDS: {
  description: string;
  expectedStatus: VerificationCodeKind;
  label: string;
}[] = [
  {
    description: '정답으로 통과해야 하는 기준 코드입니다.',
    expectedStatus: 'accepted',
    label: '정답 코드',
  },
  {
    description: '약한 테스트케이스를 잡기 위한 오답 코드입니다.',
    expectedStatus: 'wrong_answer',
    label: '오답 코드',
  },
  {
    description: '시간 제한 검증용 코드입니다.',
    expectedStatus: 'time_limit_exceeded',
    label: '시간초과 코드',
  },
  {
    description: '메모리 제한 검증용 코드입니다.',
    expectedStatus: 'memory_limit_exceeded',
    label: '메모리 초과 코드',
  },
];

export function verificationKindFromAsset(
  asset: ProblemAsset,
): VerificationCodeKind | null {
  const match = asset.storage_key.match(/\/verification-solutions\/([^/]+)\//);
  const value = match?.[1];
  return VERIFICATION_CODE_KINDS.some((kind) => kind.expectedStatus === value)
    ? (value as VerificationCodeKind)
    : null;
}

function languageFromFilename(filename: string): JudgeLanguage | null {
  const lower = filename.toLowerCase();
  if (
    lower.endsWith('.cpp') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cxx')
  ) {
    return 'cpp17';
  }
  if (lower.endsWith('.c')) return 'c99';
  if (lower.endsWith('.py')) return 'python313';
  if (lower.endsWith('.kt')) return 'kotlin';
  if (lower.endsWith('.java')) return 'java8';
  return null;
}

export function isVerificationRunning(result?: VerificationRunResult) {
  return Boolean(result && !result.error && result.stage !== 'done');
}

export default function useVerificationCodeRuns({
  contestId,
  problemId,
  token,
}: {
  contestId: string;
  problemId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<Record<string, VerificationRunResult>>({});
  const activeRunIds = useRef(new Set<string>());
  const runIdsByAsset = useRef(new Map<string, string>());
  const mounted = useRef(false);
  const historyKey = [
    'operator',
    'verification-runs',
    contestId,
    problemId,
    tokenQueryIdentity(token),
  ];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => listVerificationRuns(contestId, problemId!, token),
    enabled: Boolean(problemId && token),
    // This is shared server history, even when the previous screen's cache is fresh.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
    placeholderData: () => undefined,
    refetchInterval: (query) =>
      query.state.data?.runs.some(
        (run) =>
          isSubmissionPending(run.submission.status) ||
          (query.state.data?.available &&
            run.analysis &&
            ['queued', 'running'].includes(run.analysis.status)),
      )
        ? 3000
        : false,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function updateRun(id: string, update: Partial<VerificationRunResult>) {
    if (!mounted.current) return;
    setRuns((previous) =>
      previous[id]
        ? { ...previous, [id]: { ...previous[id], ...update } }
        : previous,
    );
  }

  async function processRun(run: VerificationRunResult, file?: File) {
    const isActive = () => mounted.current && activeRunIds.current.has(run.id);
    const refreshHistory = () =>
      queryClient.invalidateQueries({
        queryKey: ['operator', 'verification-runs', contestId, run.problemId],
      });
    try {
      const language =
        run.asset?.source_language ?? languageFromFilename(run.filename);
      if (!language) {
        throw new Error(
          '지원하지 않는 코드 파일입니다. .c, .cc, .cpp, .cxx, .py, .kt, .java 파일을 사용해 주세요.',
        );
      }
      const sourceCode = file
        ? await file.text()
        : await getStorageObjectText(run.asset!.storage_key, token);
      if (!isActive()) return;

      let verificationAsset = run.asset;
      if (file) {
        const asset = await uploadProblemAsset(
          contestId,
          run.problemId,
          token,
          file,
          `problems/${run.problemId}/verification-solutions/${run.expectedStatus}`,
        );
        if (!isActive()) return;
        verificationAsset = asset;
        runIdsByAsset.current.set(asset.asset_id, run.id);
        updateRun(run.id, { asset });
        queryClient.setQueryData<ProblemAsset[]>(
          [
            'operator',
            'problem-assets',
            contestId,
            run.problemId,
            tokenQueryIdentity(token),
          ],
          (previous = []) => [
            ...previous.filter((item) => item.asset_id !== asset.asset_id),
            asset,
          ],
        );
      }

      updateRun(run.id, { stage: 'submitting' });
      let submission = await createOperatorTestSubmission(
        contestId,
        run.problemId,
        token,
        {
          language,
          source_code: sourceCode,
          verification_asset_id: verificationAsset?.asset_id,
        },
      );
      // The server owns the job from this point, including after this screen closes.
      void refreshHistory();
      while (isActive()) {
        const pending = isSubmissionPending(submission.status);
        updateRun(run.id, { submission, stage: pending ? 'judging' : 'done' });
        if (!pending) {
          break;
        }
        submission = await waitOperatorTestSubmissionStatus(
          contestId,
          submission.submission_id,
          token,
          { pollIntervalSeconds: 0.1, waitSeconds: 1 },
        );
        // The endpoint can return immediately when progress changes.
        if (isSubmissionPending(submission.status)) {
          updateRun(run.id, { submission });
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      updateRun(run.id, {
        error: formatUserApiError(error, '검증 코드 처리에 실패했습니다.'),
        stage: 'done',
      });
    } finally {
      activeRunIds.current.delete(run.id);
      // Also recover a saved result when the browser's status request failed.
      void refreshHistory();
    }
  }

  function upload(expectedStatus: VerificationCodeKind, files: File[]) {
    if (!problemId || !files.length) return;
    const jobs = files.map((file) => ({
      file,
      run: {
        id: crypto.randomUUID(),
        problemId,
        expectedStatus,
        filename: file.name,
        stage: 'uploading' as const,
      },
    }));
    for (const { run } of jobs) activeRunIds.current.add(run.id);
    // Register the whole selection before starting any asynchronous work.
    setRuns((previous) => ({
      ...previous,
      ...Object.fromEntries(jobs.map(({ run }) => [run.id, run])),
    }));
    for (const { run, file } of jobs) void processRun(run, file);
  }

  function rerun(asset: ProblemAsset, expectedStatus: VerificationCodeKind) {
    if (!problemId) return;
    const id = runIdsByAsset.current.get(asset.asset_id) ?? crypto.randomUUID();
    if (activeRunIds.current.has(id)) return;
    runIdsByAsset.current.set(asset.asset_id, id);
    activeRunIds.current.add(id);
    const run: VerificationRunResult = {
      id,
      problemId,
      asset,
      expectedStatus,
      filename: asset.original_filename,
      stage: 'loading_source',
    };
    setRuns((previous) => ({ ...previous, [id]: run }));
    void processRun(run);
  }

  function dismiss(id: string) {
    if (activeRunIds.current.has(id)) return;
    setRuns((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  function removeAsset(asset: ProblemAsset) {
    const id = runIdsByAsset.current.get(asset.asset_id);
    if (id) dismiss(id);
    runIdsByAsset.current.delete(asset.asset_id);
    queryClient.setQueryData<SavedVerificationRuns>(historyKey, (previous) =>
      previous
        ? {
            ...previous,
            runs: previous.runs.filter(
              (run) => run.asset_id !== asset.asset_id,
            ),
          }
        : previous,
    );
    void queryClient.invalidateQueries({ queryKey: historyKey });
  }

  function removeProblem(deletedProblemId: string) {
    setRuns((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([, run]) => run.problemId !== deletedProblemId,
        ),
      ),
    );
    for (const run of Object.values(runs)) {
      if (run.problemId !== deletedProblemId) continue;
      activeRunIds.current.delete(run.id);
      if (run.asset) runIdsByAsset.current.delete(run.asset.asset_id);
    }
  }

  const saved = history.data?.runs ?? [];
  const local = Object.values(runs).filter((run) => {
    if (run.problemId !== problemId) return false;
    if (!run.submission) return true;
    const latest = saved.find((item) => item.asset_id === run.asset?.asset_id);
    if (!latest) return true;
    if (latest.submission.submission_id === run.submission.submission_id) {
      // A completed server verdict supersedes stale progress or a polling error.
      // Keep the stable local row key, but merge its data below.
      return true;
    }
    const localTime = Date.parse(run.submission.submitted_at);
    const serverTime = Date.parse(latest.submission.submitted_at);
    return (
      Number.isFinite(localTime) &&
      Number.isFinite(serverTime) &&
      localTime > serverTime
    );
  });
  const merged: VerificationRunResult[] = local.map((run) => {
    const persistent = saved.find(
      (item) => item.submission.submission_id === run.submission?.submission_id,
    );
    const serverComplete =
      persistent && !isSubmissionPending(persistent.submission.status);
    return {
      ...run,
      ...(serverComplete
        ? {
            submission: persistent.submission,
            stage: 'done' as const,
            error: undefined,
          }
        : {}),
      analysis: persistent?.analysis,
      execution: persistent?.execution,
      stale: persistent?.stale,
      persisted: Boolean(persistent),
      snapshotAvailable: persistent?.snapshot_available,
    };
  });
  for (const savedRun of saved) {
    if (local.some((run) => run.asset?.asset_id === savedRun.asset_id))
      continue;
    merged.push({
      id: savedRun.submission.submission_id,
      problemId: problemId!,
      asset: savedRun.asset,
      filename: savedRun.asset.original_filename,
      expectedStatus: savedRun.expected_status,
      stage: isSubmissionPending(savedRun.submission.status)
        ? 'judging'
        : 'done',
      submission: savedRun.submission,
      analysis: savedRun.analysis,
      execution: savedRun.execution,
      stale: savedRun.stale,
      persisted: true,
      snapshotAvailable: savedRun.snapshot_available,
    });
  }
  return {
    results: merged,
    aiAvailable: history.data?.available ?? false,
    historyError: history.error
      ? formatUserApiError(
          history.error,
          '저장된 검증 기록을 불러오지 못했습니다.',
        )
      : null,
    upload,
    rerun,
    dismiss,
    removeAsset,
    removeProblem,
  };
}
