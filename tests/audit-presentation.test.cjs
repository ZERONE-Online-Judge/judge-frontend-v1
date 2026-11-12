const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(
  __dirname,
  '../src/components/audit/auditPresentation.ts',
);
const loaded = new Module(filename, module);
const nativeRequire = loaded.require.bind(loaded);
loaded.require = (id) => {
  if (id === '@/domains/identityAccess/contestRoles') {
    const roleFile = path.resolve(
      __dirname,
      '../src/domains/identityAccess/contestRoles.ts',
    );
    const roleModule = new Module(roleFile, module);
    roleModule._compile(
      ts.transpileModule(fs.readFileSync(roleFile, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      roleFile,
    );
    return roleModule.exports;
  }
  return nativeRequire(id);
};

loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const {
  actionLabel,
  auditChanges,
  groupAuditLogs,
  valueLabel,
  fieldLabel,
  targetLabel,
  operationSummary,
  isVerificationAction,
} = loaded.exports;
function log(overrides = {}) {
  return {
    operational_audit_log_id: 'one',
    scope: 'operator',
    action: 'raw',
    method: 'POST',
    path: '/api/operator/contests/c/problems/p/testcase-sets/s/testcases',
    status_code: 200,
    contest_id: 'c',
    actor_email: 'one@example.com',
    client_ip: '127.0.0.1',
    created_at: '2026-09-24T10:00:00Z',
    details: {},
    ...overrides,
  };
}

test('contest access audit distinguishes individual and team blocks from session logout', () => {
  for (const [suffix, target] of [
    ['/access', '참가팀 전체'],
    ['/members/m/access', '참가자 개인'],
  ]) {
    for (const blocked of [true, false]) {
      const entry = log({
        method: 'PATCH',
        path: '/api/operator/contests/c/participants/t' + suffix,
        details: { body: { blocked }, target: { name: '대상 참가자' } },
      });
      assert.equal(
        actionLabel(entry),
        `${target} 대회 접근 ${blocked ? '차단' : '차단 해제'}`,
      );
      assert.equal(targetLabel(entry), '대상 참가자');
      assert.equal(
        valueLabel(blocked, 'access_blocked'),
        blocked ? '차단' : '허용',
      );
    }
  }
  assert.equal(fieldLabel('access_block_reason'), '차단 사유');
});

test('withdrawal audit distinguishes team withdrawal and cancellation from manual access blocks', () => {
  for (const withdrawn of [true, false]) {
    const entry = log({
      method: 'PATCH',
      path: '/api/operator/contests/c/participants/t/withdrawal',
      details: { body: { withdrawn }, target: { name: '기권 참가팀' } },
    });
    assert.equal(
      actionLabel(entry),
      `참가팀 ${withdrawn ? '기권 처리' : '기권 취소'}`,
    );
    assert.equal(targetLabel(entry), '기권 참가팀');
    assert.equal(
      valueLabel(withdrawn, 'withdrawn'),
      withdrawn ? '기권' : '기권 아님',
    );
  }
  assert.equal(fieldLabel('withdrawal_reason'), '기권 사유');
  assert.equal(fieldLabel('withdrawn_at'), '기권 시각');
  assert.equal(fieldLabel('withdrawn_by'), '기권 처리한 운영자');
});

test('specific actions never get mislabeled by parent resources', () => {
  for (const [url, method, label] of [
    ['/divisions/d/scoreboard/release', 'POST', '순위 전체 공개'],
    ['/problems/p/judge-bundle:warm', 'POST', '채점 패키지 준비'],
    [
      '/problems/p/verified-testcase-sets:zip',
      'POST',
      '테스트케이스 일괄 검증 등록',
    ],
    ['/problems/p', 'DELETE', '문제 삭제'],
    ['/divisions/d', 'DELETE', '참가 유형 삭제'],
    [
      '/participants/t/members/m/sessions:revoke',
      'POST',
      '참가자 계정 강제 로그아웃',
    ],
    ['/storage/presign-upload', 'POST', '파일 업로드 주소 발급'],
  ])
    assert.equal(
      actionLabel(
        log({
          path: '/api/operator/contests/c' + url,
          method,
          details: { body: { action: 'all' } },
        }),
      ),
      label,
    );
  assert.equal(
    actionLabel(log({ path: '/api/admin/service-notices/n', method: 'PATCH' })),
    '서비스 공지 수정',
  );
});

test('old audit request values are not presented as actual changes', () => {
  const details = {
    changes: [
      { field: 'title', old: 'old', new: 'new' },
      { field: 'organization_name', old: 'ZOJ', new: 'ZOJ' },
      {
        field: 'start_at',
        old: '2026-01-01T00:00:00Z',
        new: '2026-01-01T09:00:00+09:00',
      },
      { field: 'visibility', new: 'public' },
    ],
  };
  assert.deepEqual(
    auditChanges(log({ details })).map((x) => x.field),
    ['title'],
  );
  assert.deepEqual(auditChanges(log({ details, status_code: 403 })), []);
});

test('verified long-text changes remain visible even when truncated prefixes match', () => {
  const details = {
    schema_version: 2,
    change_kind: 'updated',
    changes: [
      {
        field: 'statement',
        old: 'same prefix...',
        new: 'same prefix...',
        truncated: true,
      },
    ],
  };
  assert.equal(auditChanges(log({ details })).length, 1);
  assert.equal(
    auditChanges(log({ details: { ...details, schema_version: 1 } })).length,
    0,
  );
});

test('repeated testcases collapse while every failure and individual ID remains available', () => {
  const logs = Array.from({ length: 70 }, (_, index) =>
    log({
      operational_audit_log_id: String(index),
      status_code: index === 5 ? 422 : 200,
      created_at: new Date(
        Date.parse('2026-09-24T10:00:00Z') - index * 1000,
      ).toISOString(),
    }),
  );
  const groups = groupAuditLogs(logs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].logs.length, 70);
  assert.equal(groups[0].logs.filter((x) => x.status_code === 422).length, 1);
  assert.deepEqual(
    groups.flatMap((x) => x.logs.map((x) => x.operational_audit_log_id)),
    logs.map((x) => x.operational_audit_log_id),
  );
});

test('grouping cannot combine another actor, target, contest, method or distant time', () => {
  const items = [
    log(),
    log({ operational_audit_log_id: 'actor', actor_email: 'two@example.com' }),
    log({
      operational_audit_log_id: 'target',
      path: '/api/operator/contests/c/problems/p2/testcase-sets/s/testcases',
    }),
    log({ operational_audit_log_id: 'contest', contest_id: 'another' }),
    log({ operational_audit_log_id: 'delete', method: 'DELETE' }),
    log({
      operational_audit_log_id: 'old',
      created_at: '2026-09-24T09:55:00Z',
    }),
    log({
      operational_audit_log_id: 'settings',
      path: '/api/operator/contests/c/settings',
      method: 'PATCH',
    }),
  ];
  assert.equal(groupAuditLogs(items).length, items.length);
});

test('setting values have readable labels', () => {
  assert.equal(valueLabel('private', 'problem_access_after_end'), '비공개');
  assert.equal(valueLabel('running', 'status'), '진행 중');
  assert.equal(valueLabel('resolver', 'scoreboard_release_mode'), '리졸버');
  assert.equal(
    valueLabel('manual_all', 'scoreboard_release_mode'),
    '운영진 일괄 공개',
  );
});

test('verification request labels cover initial, follow-up, analysis and cancellation', () => {
  const root = '/api/operator/contests/c/problems/p';
  for (const [suffix, body, label] of [
    ['/verification-tasks', {}, 'AI 검증 작업 요청'],
    [
      '/verification-tasks',
      { parent_task_id: 'previous' },
      'AI 검증 이어서 요청',
    ],
    ['/verification-tasks/t/stop', {}, 'AI 검증 작업 중지 요청'],
    ['/verification-runs/s/analysis', {}, '검증 코드 AI 분석 요청'],
  ]) {
    const entry = log({ path: root + suffix, details: { body } });
    assert.equal(actionLabel(entry), label);
    assert.equal(isVerificationAction(entry), true);
    assert.match(operationSummary(entry), /요청/);
  }
  const entry = log({
    path: root + '/verification-runs/s/analysis',
    details: { analysis: { status: 'queued' } },
  });
  assert.match(operationSummary(entry), /요청 당시 분석 상태: 대기/);
  assert.equal(isVerificationAction(log()), false);
});

test('historical operator requests display recipient and readable requested roles', () => {
  const entry = log({
    path: '/api/operator/contests/c/operators',
    details: {
      body: {
        display_name: '테스트 검수자',
        email: 'review@example.com',
        roles: ['problem_reviewer', 'audit_viewer'],
      },
    },
  });
  assert.equal(actionLabel(entry), '운영자 등록·권한 설정');
  assert.equal(targetLabel(entry), '테스트 검수자 (review@example.com)');
  assert.equal(
    operationSummary(entry),
    '요청 역할: 검수진, 대회 운영진 · 운영로그 보기',
  );
});

test('persisted operator snapshots distinguish creation, changes and no-op posts', () => {
  const base = {
    path: '/api/operator/contests/c/operators',
    details: {
      schema_version: 2,
      change_kind: 'created',
      target: {
        display_name: '저장된 이름',
        email: 'saved@example.com',
        roles: ['problem_author'],
      },
      body: { display_name: '요청 이름', roles: ['master'] },
    },
  };
  assert.equal(actionLabel(log(base)), '운영자 추가');
  assert.equal(targetLabel(log(base)), '저장된 이름 (saved@example.com)');
  assert.equal(operationSummary(log(base)), '저장된 역할: 출제진');
  const changed = {
    ...base,
    details: {
      ...base.details,
      change_kind: 'updated',
      changes: [
        { field: 'roles', old: ['problem_reviewer'], new: ['problem_author'] },
      ],
    },
  };
  assert.equal(actionLabel(log(changed)), '운영자 정보·권한 변경');
  assert.equal(
    actionLabel(
      log({ ...changed, details: { ...changed.details, changes: [] } }),
    ),
    '운영자 정보·권한 저장',
  );
  assert.deepEqual(
    auditChanges(
      log({
        details: {
          changes: [
            {
              field: 'roles',
              old: ['problem_reviewer', 'audit_viewer'],
              new: ['audit_viewer', 'problem_reviewer'],
            },
          ],
        },
      }),
    ),
    [],
  );
});

test('stored target names take precedence over current lookup labels and missing history is explicit', () => {
  const related_target = {
    problem_title: '현재 문제',
    problem_code: 'B',
    label_source: 'current',
  };
  assert.equal(
    targetLabel(log({ details: { related_target } })),
    'B. 현재 문제 (현재 문제명)',
  );
  assert.equal(
    targetLabel(
      log({
        details: {
          related_target,
          target: {
            problem_title: '당시 문제',
            problem_code: 'A',
            original_filename: 'wrong.cpp',
          },
        },
      }),
    ),
    'A. 당시 문제 · 검증 코드 wrong.cpp',
  );
  assert.equal(
    targetLabel(log({ details: { entities: { problem_id: '12345678abcd' } } })),
    '문제 12345678',
  );
});

test('unknown raw API action remains in details but is not a primary label', () => {
  assert.equal(
    actionLabel(
      log({
        path: '/api/operator/future-feature',
        action: 'POST /operator/future-feature',
      }),
    ),
    '운영 작업 요청',
  );
});

test('staged rejudging logs describe request, apply and cancellation precisely', () => {
  const details = {
    rejudge: {
      total: 12,
      changed_verdicts: 3,
      reason: 'Fix outputs',
      problem_code: 'A',
      problem_title: 'Sum',
    },
  };
  for (const [suffix, label] of [
    ['', '재채점 비교 작업 요청'],
    ['/batch/apply', '재채점 결과 반영'],
    ['/batch/cancel', '재채점 작업 취소'],
  ]) {
    const entry = log({
      path: '/api/operator/contests/c/rejudgings' + suffix,
      details,
    });
    assert.equal(actionLabel(entry), label);
    assert.equal(targetLabel(entry), 'A. Sum');
    assert.match(operationSummary(entry), /12개 제출/);
    assert.match(operationSummary(entry), /Fix outputs/);
  }
  assert.match(
    operationSummary(
      log({ path: '/api/operator/contests/c/rejudgings/batch/apply', details }),
    ),
    /판정 변경 3개/,
  );
});
