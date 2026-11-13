import type {
  JudgeDetail,
  SubmissionProgressState,
} from '@/domains/submissionScoreboard/types';

export const PENDING_SUBMISSION_STATUSES = [
  'waiting',
  'preparing',
  'judging',
] as const;

export function isSubmissionPending(status?: string | null) {
  return PENDING_SUBMISSION_STATUSES.includes(
    status as (typeof PENDING_SUBMISSION_STATUSES)[number],
  );
}

export function isSubmissionTerminal(status?: string | null) {
  return Boolean(status) && !isSubmissionPending(status);
}

export function submissionStatusLabel(status?: string | null) {
  switch (status) {
    case 'waiting':
      return '채점 대기 중';
    case 'preparing':
      return '채점 준비 중';
    case 'judging':
      return '채점 중';
    case 'accepted':
      return '맞았습니다';
    case 'wrong_answer':
      return '틀렸습니다';
    case 'compile_error':
      return '컴파일 에러';
    case 'runtime_error':
      return '런타임 에러';
    case 'time_limit_exceeded':
      return '시간 초과';
    case 'memory_limit_exceeded':
      return '메모리 초과';
    case 'output_limit_exceeded':
      return '출력 초과';
    case 'presentation_error':
    case 'output_format_error':
      return '출력 형식 오류';
    case 'system_error':
      return '시스템 에러';
    default:
      return status ?? '미제출';
  }
}

export function submissionStatusTone(status?: string | null) {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'waiting':
      return 'waiting';
    case 'preparing':
    case 'judging':
      return 'judging';
    case 'runtime_error':
      return 'runtime';
    case 'wrong_answer':
    case 'time_limit_exceeded':
    case 'memory_limit_exceeded':
    case 'output_limit_exceeded':
    case 'presentation_error':
    case 'output_format_error':
      return 'danger';
    case 'compile_error':
    case 'system_error':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function submissionProgressPercent(
  submission?: SubmissionProgressState | null,
) {
  const status = submission?.status;
  const current = submission?.progress_current;
  const total = submission?.progress_total;
  const percent = submission?.progress_percent;

  if (isSubmissionPending(status) && typeof percent === 'number') {
    return Math.max(0, Math.min(100, Math.round(percent)));
  }
  if (isSubmissionPending(status) && total && total > 0) {
    return Math.max(
      0,
      Math.min(100, Math.round(((current ?? 0) / total) * 100)),
    );
  }

  switch (status) {
    case 'waiting':
    case 'preparing':
    case 'judging':
      return null;
    case 'accepted':
    case 'wrong_answer':
    case 'compile_error':
    case 'runtime_error':
    case 'time_limit_exceeded':
    case 'memory_limit_exceeded':
    case 'output_limit_exceeded':
    case 'system_error':
      return 100;
    default:
      return null;
  }
}

export function submissionProgressText(
  submission?: SubmissionProgressState | null,
) {
  const status = submission?.status;
  const current = submission?.progress_current;
  const total = submission?.progress_total;
  const queuePosition = submission?.queue_position;
  const percent = submissionProgressPercent(submission);

  if (!isSubmissionPending(status)) return '';
  if (
    status === 'judging' &&
    submission?.progress_phase === 'tle_confirmation'
  ) {
    return percent === null
      ? '시간 초과 재확인 중'
      : `시간 초과 재확인 중 · ${percent}%`;
  }
  if (status === 'waiting' && typeof queuePosition === 'number') {
    return `큐 ${queuePosition}번째`;
  }
  if (percent === null) return '';
  if (total && total > 0) return `${current ?? 0}/${total} · ${percent}%`;
  return `${percent}%`;
}

export function parseJudgeDetail(message?: string | null): JudgeDetail {
  if (!message) {
    return { caseFiles: '', inputText: '', expectedText: '', actualText: '' };
  }

  const caseFiles =
    message.match(/^testcase\s+#\d+\s*\(([^)]+)\):/i)?.[1] ?? '';
  const inputText =
    message.match(/\[input\]\n([\s\S]*?)\n\[expected\]\n/)?.[1]?.trim() ?? '';
  const expectedText =
    message.match(/\[expected\]\n([\s\S]*?)\n\[actual\]\n/)?.[1]?.trim() ?? '';
  const actualText = message.match(/\[actual\]\n([\s\S]*)$/)?.[1]?.trim() ?? '';

  return { caseFiles, inputText, expectedText, actualText };
}
