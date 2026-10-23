import type { OperationalAuditLog } from '@/domains/auditMonitoring/types';
import { CONTEST_ROLES } from '@/domains/identityAccess/contestRoles';
export function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    answer_body: '답변',
    goal: '검증 요청 내용',
    source_asset_id: '선택한 검증 코드',
    parent_task_id: '이전 검증 작업',
    analysis_id: 'AI 분석',
    task_id: 'AI 검증 작업',
    submission_id: '검증 제출',
    overview: '대회 소개',
    organization_name: '주최 기관',
    display_name: '표시 이름',
    code: '참가 유형 코드',
    summary: '요약',
    judge_config: '채점 설정',
    role: '팀원 역할',
    team_leader_name: '팀장 이름',
    team_leader_email: '팀장 이메일',
    members: '팀원 목록',
    time_limit_ms_override: '테스트케이스 시간 제한',
    memory_limit_mb_override: '테스트케이스 메모리 제한',
    visibility_after_end: '종료 후 대회 공개',
    editorial_access_after_end: '종료 후 해설 공개',
    notice_access_after_end: '종료 후 공지 공개',
    scoreboard_release_mode: '순위 공개 방식',
    pinned: '상단 고정',
    emergency: '긴급 공지',
    emergency_notice: '긴급 공지 문구',
    roles: '운영자 역할',
    filename: '파일 이름',
    original_filename: '원본 파일 이름',
    category: '파일 분류',
    input_storage_key: '입력 파일',
    output_storage_key: '정답 파일',
    testcase_set_id: '테스트케이스 세트',
    testcase_id: '테스트케이스',
    editorial: '해설',
    action: '요청 작업',
    rank: '공개 순위',
    version: '버전',
    file_size: '파일 크기',
    judge_mode: '채점 방식',
    board_access_after_end: '대회 종료 후 게시판 공개',
    board_write_after_end: '대회 종료 후 질문/답변 작성',
    board_question_visibility_policy: '질문 공개 범위 정책',
    board_question_default_visibility: '질문 기본 공개 범위',
    board_comment_scope_policy: '댓글 작성 범위 정책',
    board_comment_default_scope: '댓글 기본 작성 범위',
    comment_scope: '댓글 작성 범위',
    body: '본문',
    content: '내용',
    contact_inquiry_id: '문의',
    contest_id: '대회',
    description: '설명',
    display_order: '정렬 순서',
    division_id: '참가 유형',
    email: '이메일',
    end_at: '종료 시각',
    freeze_at: '스코어보드 프리즈',
    is_active: '활성 상태',
    memory_limit_mb: '메모리 제한',
    mock_judging_enabled: '모의채점',
    mock_judging_progress_visible: '모의채점 진행률 표시',
    name: '이름',
    notice_id: '공지',
    operator_email: '운영자',
    participant_progress_visible: '참가자 진행률 표시',
    participant_team_id: '참가팀',
    problem_access_after_end: '대회 종료 후 문제 공개',
    problem_code: '문제 번호',
    problem_id: '문제',
    question_id: '게시글',
    scoreboard_access_after_end: '대회 종료 후 스코어보드 공개',
    scoreboard_freeze_mode: '스코어보드 프리즈 방식',
    source_problem_id: '복사 원본 문제',
    start_at: '시작 시간',
    statement: '문제 본문',
    status: '상태',
    submission_access_after_end: '대회 종료 후 제출 공개',
    target_division_id: '복사 대상 유형',
    team_name: '팀명',
    team_member_id: '팀원',
    time_limit_ms: '시간 제한',
    title: '제목',
    visibility: '공개 상태',
  };
  return labels[field] ?? field;
}

export function actionLabel(log: OperationalAuditLog) {
  const path = log.path.replace(/^\/api/, '');
  const method = log.method.toUpperCase();
  const rules: Array<[RegExp, Record<string, string>]> = [
    [/\/settings$/, { PATCH: '대회 설정 변경' }],
    [/\/share-link$/, { POST: '대회 공유 링크 발급' }],
    [/\/owner:transfer$/, { POST: '대회 총괄 위임' }],
    [/\/scoreboard\/release$/, { POST: '순위 발표 조작' }],
    [/\/storage\/presign-upload$/, { POST: '파일 업로드 주소 발급' }],
    [/\/participants:bulk-create$/, { POST: '참가팀 일괄 등록' }],
    [
      /\/members\/[^/]+\/sessions:revoke$/,
      { POST: '참가자 계정 강제 로그아웃' },
    ],
    [
      /\/members(?:\/[^/]+)?$/,
      { POST: '참가자 추가', PATCH: '참가자 정보 수정' },
    ],
    [
      /\/participants(?:\/[^/]+)?$/,
      { POST: '참가팀 등록', PATCH: '참가팀 정보 수정', DELETE: '참가팀 삭제' },
    ],
    [/\/problems:copy$/, { POST: '문제 복사' }],
    [/\/problem-archives:inspect$/, { POST: '문제 ZIP 파일 확인' }],
    [/\/problem-archives:import$/, { POST: '문제 ZIP 가져오기' }],
    [/\/rejudgings$/, { POST: '재채점 비교 작업 요청' }],
    [/\/rejudgings\/[^/]+\/apply$/, { POST: '재채점 결과 반영' }],
    [/\/rejudgings\/[^/]+\/cancel$/, { POST: '재채점 작업 취소' }],
    [/\/submissions\/[^/]+\/rejudge$/, { POST: '시스템 에러 제출 재채점' }],
    [/\/test-submissions$/, { POST: '검증 제출 실행' }],
    [/\/verification-tasks\/[^/]+\/stop$/, { POST: 'AI 검증 작업 중지 요청' }],
    [/\/verification-tasks$/, { POST: 'AI 검증 작업 요청' }],
    [
      /\/verification-runs\/[^/]+\/analysis$/,
      { POST: '검증 코드 AI 분석 요청' },
    ],
    [
      /\/verified-testcase-sets(?::zip)?$/,
      { POST: '테스트케이스 일괄 검증 등록' },
    ],
    [
      /\/testcases(?:\/[^/]+)?$/,
      { POST: '테스트케이스 추가', DELETE: '테스트케이스 삭제' },
    ],
    [
      /\/testcase-sets(?:\/[^/]+)?$/,
      {
        POST: '테스트케이스 세트 생성',
        PATCH: '테스트케이스 세트 수정',
        DELETE: '테스트케이스 세트 삭제',
      },
    ],
    [
      /\/assets(?:\/[^/]+)?$/,
      { POST: '문제 파일 등록', DELETE: '문제 파일 삭제' },
    ],
    [/\/judge-bundle:warm$/, { POST: '채점 패키지 준비' }],
    [
      /\/problems(?:\/[^/]+)?$/,
      { POST: '문제 생성', PATCH: '문제 수정', DELETE: '문제 삭제' },
    ],
    [
      /\/service-notices(?:\/[^/]+)?$/,
      {
        POST: '서비스 공지 작성',
        PATCH: '서비스 공지 수정',
        DELETE: '서비스 공지 삭제',
      },
    ],
    [
      /\/notices(?:\/[^/]+)?$/,
      {
        POST: '대회 공지 작성',
        PATCH: '대회 공지 수정',
        DELETE: '대회 공지 삭제',
      },
    ],
    [
      /\/answers(?:\/[^/]+)?$/,
      {
        POST: '게시판 답변 작성',
        PATCH: '게시판 답변 수정',
        DELETE: '게시판 답변 삭제',
      },
    ],
    [
      /\/boards\/[^/]+$/,
      { PATCH: '게시글 공개 상태 변경', DELETE: '게시글 삭제' },
    ],
    [
      /\/operators(?:\/[^/]+)?$/,
      {
        POST: '운영자 추가',
        PATCH: '운영자 정보·권한 변경',
        DELETE: '운영자 제거',
      },
    ],
    [
      /\/divisions(?:\/[^/]+)?$/,
      {
        POST: '참가 유형 생성',
        PATCH: '참가 유형 수정',
        DELETE: '참가 유형 삭제',
      },
    ],
    [/\/contact-inquiries\/[^/]+\/answer$/, { POST: '서비스 문의 답변 작성' }],
    [/\/contests$/, { POST: '대회 생성' }],
  ];
  if (
    method === 'POST' &&
    /\/verification-tasks$/.test(path) &&
    asRecord(log.details?.body).parent_task_id
  )
    return 'AI 검증 이어서 요청';
  if (method === 'POST' && /\/operators$/.test(path)) {
    if (log.details?.change_kind === 'created') return '운영자 추가';
    if (log.details?.change_kind === 'updated')
      return auditChanges(log).length
        ? '운영자 정보·권한 변경'
        : '운영자 정보·권한 저장';
    return '운영자 등록·권한 설정';
  }
  if (/\/scoreboard\/release$/.test(path)) {
    const action = asRecord(log.details?.body).action;
    return (
      (
        {
          start: '순위 발표 시작',
          rank: '순위 공개',
          next: '리졸버 다음 단계',
          all: '순위 전체 공개',
          undo: '순위 발표 되돌리기',
        } as Record<string, string>
      )[String(action)] ?? '순위 발표 조작'
    );
  }
  for (const [pattern, labels] of rules)
    if (pattern.test(path) && labels[method]) return labels[method];
  if (/^(POST|PATCH|PUT|DELETE) \//.test(log.action))
    return (
      (
        {
          POST: '운영 작업 요청',
          PATCH: '운영 정보 수정',
          PUT: '운영 정보 저장',
          DELETE: '운영 대상 삭제',
        } as Record<string, string>
      )[method] ?? '운영 작업'
    );
  return log.action;
}

export function isVerificationAction(log: OperationalAuditLog) {
  return (
    log.method.toUpperCase() === 'POST' &&
    /\/(?:verification-tasks(?:\/[^/]+\/stop)?|verification-runs\/[^/]+\/analysis)$/.test(
      log.path,
    )
  );
}

export function operationSummary(log: OperationalAuditLog) {
  const target = asRecord(log.details?.target),
    body = asRecord(log.details?.body);
  const rejudging = asRecord(log.details?.rejudge);
  if (/\/rejudgings(?:\/[^/]+\/(?:apply|cancel))?$/.test(log.path)) {
    const reason =
      typeof rejudging.reason === 'string' ? rejudging.reason : body.reason;
    const count = Number(rejudging.total);
    const scope = Number.isFinite(count) ? `${count}개 제출` : '선택한 제출';
    const operation = /\/apply$/.test(log.path)
      ? `${scope} 결과 반영 · 판정 변경 ${Number(rejudging.changed_verdicts) || 0}개`
      : /\/cancel$/.test(log.path)
        ? `${scope} 작업 취소 · 기존 판정 유지`
        : `${scope} 재채점 요청 · 결과 반영 전 기존 판정 유지`;
    return reason ? `${operation} · 사유: ${reason}` : operation;
  }
  if (/\/operators(?:\/[^/]+)?$/.test(log.path)) {
    const snapshot = Array.isArray(target.roles);
    const roles = snapshot ? target.roles : body.roles;
    if (Array.isArray(roles) && roles.length)
      return `${snapshot ? (log.method.toUpperCase() === 'DELETE' ? '제거 전 역할' : '저장된 역할') : '요청 역할'}: ${valueLabel(roles, 'roles')}`;
    return log.details?.change_kind === 'deleted'
      ? '대회 운영자에서 제거했습니다.'
      : '운영자 등록·설정 요청 기록입니다.';
  }
  if (isVerificationAction(log)) {
    const analysis = asRecord(log.details?.analysis);
    const status = (
      {
        queued: '대기',
        running: '진행 중',
        succeeded: '완료',
        failed: '실패',
        stopped: '중지',
        awaiting_request: '요청 대기',
      } as Record<string, string>
    )[String(analysis.status)];
    if (/\/stop$/.test(log.path))
      return status
        ? `중지 요청 당시 분석 상태: ${status}`
        : '중지 요청을 접수한 기록입니다. 실제 종료 여부는 분석 화면에서 확인하세요.';
    return status
      ? `요청 당시 분석 상태: ${status} · 요청 접수와 분석 완료는 별개입니다.`
      : '분석 요청을 접수한 기록입니다. 분석 완료 여부는 분석 화면에서 확인하세요.';
  }
  return log.details?.change_kind === 'deleted' ? '대상 삭제' : '';
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sameValue(a: unknown, b: unknown, field: string) {
  if (field === 'roles' && Array.isArray(a) && Array.isArray(b))
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (
    field.endsWith('_at') &&
    typeof a === 'string' &&
    typeof b === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(a) &&
    /^\d{4}-\d{2}-\d{2}T/.test(b)
  ) {
    const first = Date.parse(a),
      second = Date.parse(b);
    if (Number.isFinite(first) && Number.isFinite(second))
      return first === second;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export type AuditChange = {
  field: string;
  old?: unknown;
  new: unknown;
  truncated?: boolean;
};
export function auditChanges(log: OperationalAuditLog): AuditChange[] {
  if (log.status_code >= 400) return [];
  const items = log.details?.changes;
  if (!Array.isArray(items)) return [];
  return items
    .map(asRecord)
    .filter(
      (item) =>
        typeof item.field === 'string' &&
        !['created_at', 'updated_at', 'published_at'].includes(item.field) &&
        // Old logs recorded submitted values as changes: only show a proven difference.
        'old' in item &&
        (!sameValue(item.old, item.new, String(item.field)) ||
          (log.details?.schema_version === 2 && item.truncated === true)),
    )
    .map((item) => ({
      field: String(item.field),
      old: item.old,
      new: item.new,
      truncated: item.truncated === true,
    }));
}

export function valueLabel(value: unknown, field = ''): string {
  if (value === null || value === undefined) return '없음';
  if (typeof value === 'boolean') return value ? '사용' : '사용 안 함';
  if (typeof value === 'number') {
    const unit = field.startsWith('time_limit_ms')
      ? ' ms'
      : field.startsWith('memory_limit_mb')
        ? ' MB'
        : field === 'file_size'
          ? ' bytes'
          : '';
    return value.toLocaleString('ko-KR') + unit;
  }
  if (Array.isArray(value))
    return value.map((item) => valueLabel(item, field)).join(', ') || '없음';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (field === 'roles')
    return CONTEST_ROLES.find((role) => role.value === text)?.label ?? text;
  const enumerations: Record<string, Record<string, string>> = {
    visibility: {
      public: '공개',
      private: '비공개',
      participants: '참가자 공개',
      questioner: '질문자 공개',
    },
    board_question_visibility_policy: {
      choice: '작성자가 선택',
      public: '공개 질문만 허용',
      private: '비공개 질문만 허용',
    },
    board_question_default_visibility: { public: '공개', private: '비공개' },
    board_comment_scope_policy: {
      choice: '작성자가 선택',
      all: '전체로 고정',
      operators: '운영진만으로 고정',
    },
    board_comment_default_scope: { all: '전체', operators: '운영진만' },
    comment_scope: { all: '전체', operators: '운영진만' },
    status: {
      draft: '초안',
      scheduled: '예정(비공개)',
      open: '예정(공개)',
      running: '진행 중',
      ended: '종료',
      finalized: '결과 확정',
      archived: '보관',
    },
    scoreboard_release_mode: {
      manual: '순위별 공개',
      resolver: '리졸버',
      immediate: '즉시 공개',
    },
    scoreboard_freeze_mode: {
      auto: '일정에 따라',
      frozen: '강제 프리즈',
      live: '프리즈 해제',
    },
  };
  if (field.includes('access_after_end') || field === 'visibility_after_end')
    return enumerations.visibility[text] ?? text;
  if (enumerations[field]?.[text]) return enumerations[field][text];
  if (/_at$/.test(field) && Number.isFinite(Date.parse(text)))
    return new Date(text).toLocaleString('ko-KR');
  return text || '비어 있음';
}

export function targetLabel(log: OperationalAuditLog) {
  const target = asRecord(log.details?.target),
    body = asRecord(log.details?.body),
    entities = asRecord(log.details?.entities);
  const rejudging = asRecord(log.details?.rejudge);
  if (
    /\/rejudgings(?:\/[^/]+\/(?:apply|cancel))?$/.test(log.path) &&
    typeof rejudging.problem_title === 'string'
  ) {
    return `${rejudging.problem_code ? `${rejudging.problem_code}. ` : ''}${rejudging.problem_title}`;
  }
  if (/\/operators(?:\/[^/]+)?$/.test(log.path)) {
    const name = target.display_name || body.display_name;
    const email = target.email || body.email || entities.operator_email;
    return [
      typeof name === 'string' ? name : '',
      typeof email === 'string' ? (name ? `(${email})` : email) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  const related = asRecord(log.details?.related_target);
  const problemTitle = target.problem_title || related.problem_title;
  if (typeof problemTitle === 'string') {
    const code = target.problem_code || related.problem_code;
    const current =
      !target.problem_title && related.label_source === 'current'
        ? ' (현재 문제명)'
        : '';
    return [
      code ? `${code}. ${problemTitle}${current}` : `${problemTitle}${current}`,
      typeof target.original_filename === 'string'
        ? `검증 코드 ${target.original_filename}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const name =
    target.title ||
    target.name ||
    target.team_name ||
    target.original_filename ||
    body.title ||
    body.name ||
    body.team_name ||
    body.original_filename ||
    body.filename;
  if (typeof name === 'string') return name;
  if (body.input_storage_key)
    return String(body.input_storage_key).split('/').pop() ?? '';
  if (body.rank) return `${body.rank}위`;
  if (target.display_order || body.display_order)
    return `${target.display_order ?? body.display_order}번 테스트케이스`;
  if (entities.problem_id)
    return `문제 ${String(entities.problem_id).slice(0, 8)}`;
  if (entities.division_id)
    return `참가 유형 ${String(entities.division_id).slice(0, 8)}`;
  return '';
}

function bulkKey(log: OperationalAuditLog) {
  const path = log.path;
  let operation = '';
  if (/\/testcases(?:\/[^/]+)?$/.test(path))
    operation = path.replace(/(\/testcases)\/[^/]+$/, '$1');
  else if (/\/storage\/presign-upload$/.test(path))
    operation = `${path}:${String(asRecord(log.details?.body).category ?? '')}`;
  else if (/\/assets(?:\/[^/]+)?$/.test(path))
    operation = path.replace(/(\/assets)\/[^/]+$/, '$1');
  if (!operation || !log.actor_email) return null;
  return JSON.stringify([
    log.contest_id,
    log.actor_email,
    log.client_ip,
    log.method,
    operation,
  ]);
}

export function groupAuditLogs(logs: OperationalAuditLog[]) {
  const groups: Array<{ id: string; logs: OperationalAuditLog[] }> = [];
  const current = new Map<string, (typeof groups)[number]>();
  for (const log of logs) {
    const key = bulkKey(log),
      previous = key ? current.get(key) : undefined;
    const delta = previous
      ? Date.parse(previous.logs[0].created_at) - Date.parse(log.created_at)
      : Infinity;
    if (previous && delta >= 0 && delta <= 120_000) previous.logs.push(log);
    else {
      const group = { id: log.operational_audit_log_id, logs: [log] };
      groups.push(group);
      if (key) current.set(key, group);
    }
  }
  return groups;
}
