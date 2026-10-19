import type { ApiErrorBody } from '@/shared/api/types';

export class ApiClientError extends Error {
  status: number;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function isSessionAuthError(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 ||
      error.code === 'authentication_required' ||
      error.code === 'invalid_token' ||
      error.code === 'session_revoked')
  );
}

export function toApiError(response: Response, payload: unknown) {
  const body = payload as ApiErrorBody | null;

  return new ApiClientError(
    response.status,
    body?.error?.code ?? 'request_failed',
    body?.error?.message ?? `API ${response.status}`,
    body?.error?.request_id ?? body?.request_id,
    body?.error?.details,
  );
}

export function formatApiError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    const message = apiErrorUserMessage(error);
    return message ? `${fallback}: ${message}` : fallback;
  }

  if (error instanceof Error) {
    return `${fallback}: ${error.message}`;
  }

  return fallback;
}

export function formatUserApiError(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    const message = apiErrorUserMessage(error);
    return message ? `${fallback}: ${message}` : fallback;
  }

  if (error instanceof Error) {
    return fallback;
  }

  return fallback;
}

function apiErrorUserMessage(error: ApiClientError) {
  if (error.status === 413)
    return '전송할 데이터가 너무 큽니다. 파일이나 코드 크기를 줄여 주세요.';
  if (error.code === 'api_busy') return error.message;
  if (
    error.code === 'rejudging_conflict' ||
    error.code.startsWith('problem_deletion_')
  )
    return error.message;
  if (error.code.startsWith('verification_')) return error.message;

  if (error.code.startsWith('problem_archive_')) return error.message;
  if (
    [
      'invalid_presentation_account',
      'presentation_login_rate_limited',
      'presentation_login_required',
    ].includes(error.code)
  )
    return error.message;
  if (error.code === 'contest_locked') {
    return '대회가 진행 중이라 문제 내용, 제한 시간, 테스트케이스처럼 채점 결과가 바뀔 수 있는 항목은 수정할 수 없습니다. 대회 종료 후 다시 시도해 주세요.';
  }

  if (error.code === 'invalid_analytics_period') return error.message;

  if (error.code === 'validation_error') {
    return '입력한 값을 다시 확인해 주세요.';
  }

  if (error.code === 'invalid_credentials') {
    return '인증 정보가 올바르지 않습니다. 다시 확인해 주세요.';
  }

  if (error.code === 'authentication_required') {
    return '로그인이 필요합니다.';
  }

  if (error.code === 'permission_denied' || error.code === 'scope_denied') {
    return '이 작업을 수행할 권한이 없습니다.';
  }

  if (error.code === 'not_found') {
    return '요청한 정보를 찾을 수 없습니다.';
  }

  if (error.code.startsWith('contest_owner_')) {
    return error.message;
  }

  if (error.code === 'last_operator') {
    return '마지막 대회 운영자는 제거할 수 없습니다.';
  }

  if (error.code === 'email_already_in_use') {
    return '이미 등록된 이메일입니다. 다른 이메일을 입력해 주세요.';
  }

  if (
    [
      'operator_account_already_assigned',
      'operator_account_participant',
      'operator_account_unchanged',
      'operator_account_changed',
    ].includes(error.code)
  ) {
    return error.message;
  }

  if (error.code === 'email_change_scope_denied') {
    return '이메일을 변경하려면 해당 계정이 속한 모든 대회에서 운영자 관리 권한이 필요합니다.';
  }

  if (error.code === 'email_change_participant_identity') {
    return '참가자 계정에도 연결된 이메일은 이 화면에서 변경할 수 없습니다. 서비스 관리자에게 문의해 주세요.';
  }

  if (error.code === 'assigned_master_email_immutable') {
    return '서비스 관리자가 배정한 대회 마스터의 이메일은 서비스 관리자만 변경할 수 있습니다.';
  }

  if (error.code === 'self_remove_denied') {
    return '현재 로그인한 운영자 자신은 제거할 수 없습니다.';
  }

  if (error.code === 'service_master_operator_immutable') {
    return '서비스 마스터는 모든 대회 권한을 자동으로 가지므로 대회 운영자 목록에서 관리할 수 없습니다.';
  }

  if (error.code === 'participant_has_submission') {
    return '제출 이력이 있는 참가팀은 삭제할 수 없습니다.';
  }

  if (error.code === 'participant_has_question') {
    return '질문 이력이 있는 참가팀은 삭제할 수 없습니다.';
  }

  if (error.code === 'testcase_pair_missing') {
    return '입력 파일과 출력 파일 쌍이 맞지 않습니다. .in/.out 파일 구성을 확인해 주세요.';
  }

  if (
    error.code === 'archive_file_too_large' ||
    error.code === 'archive_too_large'
  ) {
    return '업로드한 압축 파일 또는 포함된 파일이 너무 큽니다.';
  }

  if (
    error.code === 'testcase_verification_failed' ||
    error.code === 'package_asset_verification_failed' ||
    error.code === 'package_build_failed'
  ) {
    return '채점 보조 파일 또는 테스트케이스 검증에 실패했습니다. 파일 구성을 확인해 주세요.';
  }

  if (error.status === 401 || error.status === 403) {
    return '로그인 상태 또는 접근 권한을 확인해 주세요.';
  }

  if (error.status === 404) {
    return '요청한 정보를 찾을 수 없습니다.';
  }

  if (error.status === 409) {
    return '이미 처리된 정보이거나 현재 상태와 충돌합니다.';
  }

  if (error.status === 410) {
    return '더 이상 사용할 수 없는 요청입니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
  }

  if (error.status === 422) {
    return '입력한 값을 다시 확인해 주세요.';
  }

  if (error.status === 429) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (error.status >= 500) {
    return '서버 응답이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '';
}

export function readRetryAfterSeconds(error: unknown) {
  if (!(error instanceof ApiClientError)) return 0;

  const value = error.details?.retry_after_seconds;
  return typeof value === 'number' && value > 0 ? value : 0;
}
