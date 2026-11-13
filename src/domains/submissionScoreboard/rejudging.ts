import type { Submission } from './types';

export type RejudgingTarget = {
  submission_id?: string;
  problem_id?: string;
  team_id?: string;
  language?: string;
};
export type RejudgingResult = Pick<
  Submission,
  | 'scoring_mode'
  | 'score'
  | 'max_score'
  | 'subtask_results'
  | 'status'
  | 'compile_message'
  | 'judge_message'
  | 'runtime_ms'
  | 'memory_kb'
  | 'failed_testcase_order'
  | 'progress_current'
  | 'progress_total'
>;
export type Rejudging = {
  rejudging_id: string;
  problem_id: string;
  problem_code: string;
  status: 'pending' | 'ready' | 'blocked' | 'applied' | 'cancelled';
  reason: string;
  scope: RejudgingTarget & {
    kind: 'submission' | 'problem';
    skipped_pending: number;
  };
  total: number;
  completed: number;
  system_errors: number;
  changed_verdicts: number;
  requested_by_name: string;
  requested_by_email: string;
  decided_by_email: string | null;
  created_at: string;
  decided_at: string | null;
};
export type RejudgingDetail = Rejudging & {
  items: {
    submission_id: string;
    language: string;
    submitted_at: string;
    original_result: RejudgingResult;
    candidate_result: RejudgingResult;
    changed: boolean;
  }[];
  offset: number;
  limit: number;
  has_next: boolean;
};
export const rejudgingStatusLabel: Record<Rejudging['status'], string> = {
  pending: '재채점 진행 중',
  ready: '결과 반영 대기',
  blocked: '시스템 에러 · 반영 불가',
  applied: '결과 반영 완료',
  cancelled: '취소됨',
};
export function canRejudgeSubmission(submission?: Submission) {
  return Boolean(
    submission &&
    [
      'accepted',
      'wrong_answer',
      'compile_error',
      'runtime_error',
      'time_limit_exceeded',
      'memory_limit_exceeded',
      'output_limit_exceeded',
      'system_error',
    ].includes(submission.status) &&
    submission.submission_kind !== 'verification_trial',
  );
}
