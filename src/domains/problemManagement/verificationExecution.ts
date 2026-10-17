import { apiRequest } from '@/shared/api/client';

export type VerificationExecution = {
  collect_all_results: true;
  total: number;
  completed: number;
  full_suite_complete: boolean;
  node_name: string | null;
  agent_version: string | null;
  testcase_version: number | null;
  observed_statuses: string[];
  runtime_ms: number | null;
  memory_kb: number | null;
};
export type VerificationCase = {
  index: number;
  final_status: string;
  runtime_ms: number | null;
  memory_kb: number | null;
  output_available: boolean;
  output_truncated: boolean;
};
export type VerificationCases = {
  execution: VerificationExecution | null;
  testcases: VerificationCase[];
  indices?: number[];
};
export type VerificationCasePreview = {
  text: string;
  size: number | null;
  truncated: boolean;
};
export type VerificationCaseDetail = VerificationCase & {
  judge_message: string;
  input: VerificationCasePreview;
  expected: VerificationCasePreview;
  actual: VerificationCasePreview | null;
};
export function verificationExpectationMatches(
  expected: string,
  actual: string | undefined,
  execution?: VerificationExecution | null,
) {
  if (!execution) return actual === expected;
  return (
    execution.full_suite_complete &&
    !execution.observed_statuses.includes('system_error') &&
    (expected === 'accepted'
      ? execution.observed_statuses.every((status) => status === 'accepted')
      : execution.observed_statuses.includes(expected))
  );
}
export function verificationStatusCode(status: string) {
  return (
    (
      {
        accepted: 'AC',
        wrong_answer: 'WA',
        time_limit_exceeded: 'TLE',
        memory_limit_exceeded: 'MLE',
        runtime_error: 'RE',
        output_limit_exceeded: 'OLE',
        system_error: 'SE',
        compile_error: 'CE',
      } as Record<string, string>
    )[status] || status
  );
}
function path(contestId: string, problemId: string, submissionId: string) {
  return `/operator/contests/${encodeURIComponent(contestId)}/problems/${encodeURIComponent(problemId)}/verification-runs/${encodeURIComponent(submissionId)}/testcases`;
}
export function getVerificationCases(
  contestId: string,
  problemId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<VerificationCases>(
    path(contestId, problemId, submissionId),
    token,
  );
}
export function getVerificationCaseDetail(
  contestId: string,
  problemId: string,
  submissionId: string,
  index: number,
  token: string,
) {
  return apiRequest<VerificationCaseDetail>(
    `${path(contestId, problemId, submissionId)}/${index}`,
    token,
  );
}
