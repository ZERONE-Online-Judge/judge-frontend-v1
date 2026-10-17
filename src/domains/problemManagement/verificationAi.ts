import type { VerificationExecution } from './verificationExecution';
import { apiRequest, apiBlobRequest } from '@/shared/api/client';
import type { ProblemAsset } from './types';
import type { Submission } from '@/domains/submissionScoreboard/types';
import type { VerificationCodeKind } from './useVerificationCodeRuns';

export type VerificationReport = {
  report_kind?: 'investigation';
  conclusion?:
    | 'test_gap'
    | 'expectation_error'
    | 'solution_error'
    | 'judge_issue'
    | 'infrastructure_issue'
    | 'inconclusive';
  sections?: { title: string; body: string; evidence_refs: string[] }[];
  recommendations?: {
    target:
      | 'testcases'
      | 'expectation'
      | 'solution'
      | 'judge'
      | 'infrastructure'
      | 'investigation';
    title: string;
    action: string;
    verification: string;
    artifact_id: string;
    evidence_refs: string[];
  }[];
  summary: string;
  verdict_assessment: string;
  causes: {
    title: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string;
    explanation: string;
    code_reference: string;
  }[];
  fixes: {
    title: string;
    change: string;
    code_example: string;
    verification: string;
  }[];
  suggested_tests: {
    input: string;
    expected_output: string;
    explanation: string;
  }[];
  limitations: string[];
};
export type VerificationAnalysis = {
  engine_version?: number;
  phase?: string | null;
  calls?: number;
  tool_count?: number;
  can_retry?: boolean;
  investigation_focus?: string;
  probe_checks?: {
    check_id: string;
    status: 'cross_checked' | 'conflict' | 'incomplete';
    validator_id: string;
    reference_id: string;
    experiment_id: string;
    note: string;
    input: string;
    expected_output: string;
    details?: {
      validator?: { status?: string; exit_code?: number | null };
      reference?: {
        status?: string;
        exit_code?: number | null;
        output?: string;
      };
      expected_matches_reference?: boolean;
    } | null;
  }[];
  stop_reason?: { code: string; message: string } | null;
  plan?: { title: string; status: 'pending' | 'in_progress' | 'done' }[];
  findings?: {
    id: string;
    title: string;
    detail: string;
    status: 'confirmed' | 'hypothesis' | 'rejected';
    evidence_refs: string[];
  }[];
  question?: { question: string; reason: string } | null;
  outcome?: 'completed' | 'inconclusive' | null;
  limits?: {
    max_cost_usd: number;
    max_runs: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    max_calls?: number;
    max_tools?: number;
  } | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
    cached_input_tokens?: number;
    by_model?: Record<string, { calls: number }>;
  } | null;
  trace?: { tool: string; status: string; detail: string; at: string }[];
  files_read?: {
    file_id: string;
    offset?: number;
    complete?: boolean;
    image_attached?: boolean;
  }[];
  artifacts?: {
    artifact_id: string;
    source: string;
    language: string;
    sha256: string;
    purpose?: 'repair' | 'comparison';
    verification?: {
      status: 'passed' | 'failed' | 'inconclusive' | 'pending' | 'unverified';
      message: string;
      source_sha256: string;
      registered_passed: boolean;
      testcase_count: number;
      execution_ids: string[];
      unreplayed_probes: number;
      probe_conflicts: number;
    };
  }[];
  executions?: {
    submission_id: string;
    artifact_id: string;
    scope: 'all' | 'selected' | 'probe';
    probe?: {
      input: string;
      expected_output: string;
      expected_output_source: string;
      validator_checked: boolean;
    } | null;
    testcase_orders: number[] | null;
    testcase_count: number;
    status: string;
    failed_testcase_order: number | null;
    runtime_ms: number | null;
    memory_kb: number | null;
    agent_version: string | null;
    judge_message: string;
    compile_message: string;
  }[];
  workspace_files?: {
    path: string;
    bytes: number;
    sha256: string;
    read_only?: boolean;
  }[];
  playground_runs?: {
    request_id: string;
    command: string;
    exit_code: number | null;
    timed_out: boolean;
    stdout: string;
    output_truncated: boolean;
    wall_ms: number;
    notes: string[];
    files: { path: string; bytes: number }[];
  }[];
  analysis_id: string;
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'awaiting_request'
    | 'awaiting_input'
    | 'stopped';
  model: string;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  report?: VerificationReport | null;
  coverage?: {
    total_testcases: number;
    full_testcases: number;
    partial_testcases: number;
    omitted_testcases: number;
    partial: boolean;
    testcase_version: number | null;
    notes: string[];
    files: {
      filename: string;
      included: boolean;
      complete: boolean;
      note: string | null;
    }[];
  } | null;
};
export type SavedVerificationRuns = {
  available: boolean;
  model: string;
  runs: {
    asset_id: string;
    asset: ProblemAsset;
    expected_status: VerificationCodeKind;
    execution?: VerificationExecution | null;
    snapshot_available?: boolean;
    submission: Submission;
    stale: boolean;
    analysis: VerificationAnalysis | null;
  }[];
};
const base = (contestId: string, problemId: string) =>
  `/operator/contests/${contestId}/problems/${problemId}/verification-runs`;
export function listVerificationRuns(
  contestId: string,
  problemId: string,
  token: string,
) {
  return apiRequest<SavedVerificationRuns>(base(contestId, problemId), token);
}
export function getVerificationAnalysis(
  contestId: string,
  problemId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<{
    available: boolean;
    analysis: VerificationAnalysis | null;
  }>(`${base(contestId, problemId)}/${submissionId}/analysis`, token);
}
export function requestVerificationAnalysis(
  contestId: string,
  problemId: string,
  submissionId: string,
  token: string,
) {
  return apiRequest<{
    available: boolean;
    analysis: VerificationAnalysis | null;
  }>(`${base(contestId, problemId)}/${submissionId}/analysis`, token, {
    method: 'POST',
  });
}

export function downloadVerificationWorkspace(
  contestId: string,
  problemId: string,
  submissionId: string,
  token: string,
) {
  return apiBlobRequest(
    `${base(contestId, problemId)}/${submissionId}/workspace.zip`,
    token,
  );
}
