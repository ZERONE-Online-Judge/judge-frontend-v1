import { apiRequest } from '@/shared/api/client';

export type EditorJob = {
  id: string;
  name?: string;
  result_redacted?: boolean;
  result_truncated?: boolean;
  problem: { id: string; slug: string; name: string; deleted: boolean } | null;
  requester: {
    id: string;
    email: string;
    display_name: string;
    handle: string;
  } | null;
  kind: string;
  category: string;
  status: string;
  revision: number;
  workspace_version: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  outcome?: {
    execution: string;
    assessment: {
      status: string;
      code: string;
      partial?: boolean;
      counts?: {
        total: number;
        passed: number;
        failed: number;
        unconfirmed: number;
      };
      iterations?: number;
      found?: number;
    };
  };
  options?: Record<string, unknown>;
  result: Record<string, unknown> & { summary?: string; progress?: number };
};

export type EditorJobPage = {
  items: EditorJob[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export const editorJobCategories = [
  ['all', '전체 작업'],
  ['verify', '전체 검증'],
  ['verify-single', '단일 검증'],
  ['stress', '스트레스 테스트'],
  ['package', '패키지 생성'],
  ['prepare-full', '테스트 준비'],
  ['prepare-inputs', '입력 생성'],
  ['prepare-validate', '입력 검증'],
  ['prepare-answers', '정답 생성'],
  ['validator-tests', 'Validator 테스트'],
  ['checker-tests', 'Checker 테스트'],
  ['render', '지문 렌더링'],
] as const;

export const editorJobStatuses = [
  ['all', '전체 상태'],
  ['queued', '대기 중'],
  ['running', '실행 중'],
  ['completed', '완료'],
  ['failed', '실패'],
  ['cancelled', '중단'],
] as const;

export function listAdminEditorJobs(
  token: string,
  options: { page: number; q: string; category: string; status: string },
) {
  const search = new URLSearchParams({
    page: String(options.page),
    page_size: '20',
  });
  for (const key of ['q', 'category', 'status'] as const) {
    if (options[key] && options[key] !== 'all') search.set(key, options[key]);
  }
  return apiRequest<EditorJobPage>(`/admin/judge/editor-jobs?${search}`, token);
}

export function getAdminEditorJob(token: string, id: string) {
  return apiRequest<EditorJob>(
    `/admin/judge/editor-jobs/${encodeURIComponent(id)}`,
    token,
  );
}

export function editorJobCategory(job: Pick<EditorJob, 'category' | 'kind'>) {
  return (
    editorJobCategories.find(([key]) => key === job.category)?.[1] ??
    (job.kind === 'prepare' ? '테스트 준비' : job.kind)
  );
}

export function editorJobStatus(status: string) {
  return editorJobStatuses.find(([key]) => key === status)?.[1] ?? status;
}

export function editorJobPending(job: Pick<EditorJob, 'status'>) {
  return job.status === 'queued' || job.status === 'running';
}

export function editorJobResult(job: EditorJob) {
  if (editorJobPending(job)) return editorJobStatus(job.status);
  const labels: Record<string, string> = {
    expectations_match: '예상 일치',
    expectations_differ: '예상 불일치',
    component_matches: '예상 일치',
    component_differs: '예상 불일치',
    input_valid: '입력 검사 통과',
    input_rejected: '입력 검사 불통과',
    input_format: '입력 형식 불통과',
    input_duplicate: '중복 입력 발견',
    preparation_ready: '생성·검사 통과',
    reference_failed: '기준 풀이 실패',
    reference_rejected: '정답 확인 불통과',
    incomplete_checks: '확인 미완료',
    verification_skipped: '검증 생략',
    no_targets: '검사 대상 없음',
    missing_evidence: '결과 미확인',
    render_ready: '문서 생성 완료',
    render_failed: '문서 생성 불완전',
    counterexample_found: '반례 발견',
    counterexample_not_found: '반례 미발견',
  };
  if (job.status !== 'completed') return editorJobStatus(job.status);
  const code = job.outcome?.assessment.code;
  return (code && labels[code]) || '완료';
}

export function editorJobDate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function editorJobProgress(job: EditorJob) {
  const value = job.result.progress;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}
