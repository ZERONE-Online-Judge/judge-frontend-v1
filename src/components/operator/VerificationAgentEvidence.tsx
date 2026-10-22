import BoundedText from '@/shared/ui/BoundedText';
import { useState } from 'react';
import VerificationMarkdown from '@/components/operator/VerificationMarkdown';
import type { VerificationAnalysis } from '@/domains/problemManagement/verificationAi';

const verdicts: Record<string, string> = {
  waiting: '채점 대기',
  preparing: '준비 중',
  judging: '채점 중',
  accepted: '정답',
  wrong_answer: '틀렸습니다',
  compile_error: '컴파일 오류',
  runtime_error: '실행 오류',
  system_error: '채점 시스템 오류',
  time_limit_exceeded: '시간 초과',
  memory_limit_exceeded: '메모리 초과',
  output_limit_exceeded: '출력 초과',
};
const tools: Record<string, string> = {
  list_files: '파일 찾기',
  read_file: '필요한 부분 읽기',
  search_file: '파일 검색',
  read_image: '이미지 확인',
  inspect_judge: '채점 환경·실측 기준 확인',
  estimate_runtime: '복잡도 기반 시간 추정(가설)',
  edit_code: '수정안 작성·실제 채점',
  run_code: '실제 채점',
  run_probe: '제안 반례 실행',
  check_probe: '입력·기대 출력 교차 검증',
  workspace_copy: '작업 파일 가져오기',
  workspace_write: '작업 파일 작성',
  workspace_patch: '작업 파일 수정',
  workspace_delete: '작업 파일 삭제',
  workspace_read: '작업 파일 읽기',
  workspace_list: '작업 파일 찾기',
  workspace_exec: '플레이그라운드 실행',
  workspace_candidate: '최종 후보 저장·실제 채점',
  escalate: '상위 모델 검토',
  finish_report: '보고서 작성',
  update_plan: '검증 계획 갱신',
  record_finding: '근거 기록',
  ask_user: '조건 확인 요청',
  finish_task: '작업 결과 작성',
  list_verification_runs: '채점 기록 찾기',
  read_verification_run: '채점 당시 코드와 로그 조회',
  enable_tools: '필요한 도구 불러오기',
};
const codeName = (id: string) =>
  id === 'original'
    ? '원본 코드'
    : id.startsWith('candidate-')
      ? `수정안 ${id.slice(10)}`
      : '참조 코드';

export default function VerificationAgentEvidence({
  analysis,
}: {
  analysis: VerificationAnalysis;
}) {
  const [view, setView] = useState<'activity' | 'executions' | 'resources'>(
    analysis.status === 'running' ? 'activity' : 'executions',
  );
  if (analysis.engine_version !== 2) return null;
  const name = (id: string) =>
    analysis.artifacts?.find((a) => a.artifact_id === id)?.purpose ===
    'comparison'
      ? `대조 코드 ${id.replace('candidate-', '')}`
      : codeName(id);
  return (
    <details
      aria-label="에이전트 작업 기록"
      className="group/agent min-w-0 rounded-xl border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 focus-visible:outline-indigo-500 [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 gap-1">
          <span className="text-sm font-semibold text-slate-900">
            에이전트 작업 기록
          </span>
          <span className="text-xs leading-5 text-slate-500">
            실제 채점 {analysis.executions?.length ?? 0}회 · 실험{' '}
            {analysis.playground_runs?.length ?? 0}회 · 도구{' '}
            {analysis.tool_count ?? 0}회
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
          {analysis.usage ? (
            <span>예상 ${analysis.usage.estimated_cost_usd.toFixed(4)}</span>
          ) : null}
          <span className="font-medium text-indigo-700 group-open/agent:hidden">
            기록 펼치기 ＋
          </span>
          <span className="hidden font-medium text-indigo-700 group-open/agent:inline">
            접기 −
          </span>
        </span>
      </summary>
      <div className="min-w-0 border-t border-slate-100">
        <div
          role="group"
          aria-label="작업 기록 종류"
          className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 p-2"
        >
          {(
            [
              ['executions', '실행 결과'],
              ['activity', '작업 로그'],
              ['resources', '자료·사용량'],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={
                'rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-indigo-500 ' +
                (view === id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="region"
          aria-label="작업 기록 상세"
          tabIndex={0}
          className="max-h-[32rem] min-w-0 overflow-y-auto overscroll-contain p-3 sm:p-4"
        >
          <div hidden={view !== 'executions'}>
            <div className="grid min-w-0 gap-4">
              {analysis.probe_checks?.length ? (
                <section className="grid min-w-0 gap-2">
                  <h4 className="text-sm font-semibold text-slate-950">
                    반례 교차 검증
                  </h4>
                  {analysis.probe_checks.map((check, index) => (
                    <details
                      key={check.check_id}
                      className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <summary className="cursor-pointer font-semibold">
                        반례 {index + 1} ·{' '}
                        {
                          {
                            cross_checked: '입력·기대 출력 교차 확인',
                            conflict: '불일치 발견',
                            incomplete: '추가 확인 필요',
                          }[check.status]
                        }
                      </summary>
                      <p className="mt-2 break-all">
                        validator: {check.validator_id || '미확보'} · 참조 풀이:{' '}
                        {check.reference_id || '미확보'}
                      </p>
                      <p className="mt-2 leading-6">{check.note}</p>
                      <BoundedText
                        tabIndex={0}
                        className="mt-2 max-h-60 overflow-auto rounded bg-slate-900 p-3 text-slate-100"
                      >{`입력\n${check.input}\n제안 기대 출력\n${check.expected_output}`}</BoundedText>
                      {check.details?.reference?.output != null ? (
                        <BoundedText
                          tabIndex={0}
                          className="mt-2 max-h-40 overflow-auto rounded bg-slate-100 p-2"
                        >{`참조 풀이 실제 출력\n${check.details.reference.output}`}</BoundedText>
                      ) : null}
                      <p className="mt-2 break-all text-slate-500">
                        근거: probe-check:{check.check_id} · experiment:
                        {check.experiment_id}
                      </p>
                    </details>
                  ))}
                </section>
              ) : null}
              {analysis.playground_runs?.length ? (
                <section className="grid min-w-0 gap-2">
                  <h4 className="text-sm font-semibold text-slate-950">
                    플레이그라운드 실험
                  </h4>
                  <p className="text-xs leading-5 text-slate-600">
                    별도 격리 환경에서 파일을 편집하고 코드를 대조한 기록입니다.
                    아래 최종 채점과 실행 환경이 다르므로 여기의 시간·메모리를
                    공식 제한과 직접 비교하지 마세요.
                  </p>
                  {analysis.playground_runs.map((run, index) => (
                    <details
                      key={run.request_id}
                      className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <summary className="cursor-pointer font-semibold text-slate-900">
                        실험 {index + 1} ·{' '}
                        {run.timed_out
                          ? '시간 한도 도달'
                          : `종료 코드 ${run.exit_code}`}{' '}
                        · {(run.wall_ms / 1000).toFixed(2)}초
                      </summary>
                      <BoundedText
                        aria-label={`실험 ${index + 1} 명령`}
                        tabIndex={0}
                        className="my-2 max-h-32 min-w-0 overflow-auto rounded bg-slate-100 p-2"
                      >
                        {run.command}
                      </BoundedText>
                      <BoundedText
                        aria-label={`실험 ${index + 1} 출력`}
                        tabIndex={0}
                        className="max-h-60 min-w-0 overflow-auto rounded bg-slate-900 p-3 leading-6 text-slate-100"
                      >
                        {run.stdout || '(출력 없음)'}
                      </BoundedText>
                      {run.output_truncated ? (
                        <p className="mt-2 text-amber-800">
                          출력이 길어 일부만 보관했습니다.
                        </p>
                      ) : null}
                      {run.notes?.map((note, i) => (
                        <p className="mt-1 break-words text-amber-800" key={i}>
                          {note}
                        </p>
                      ))}
                    </details>
                  ))}
                </section>
              ) : null}
              {analysis.executions?.length ? (
                <section className="grid min-w-0 gap-2">
                  <h4 className="text-sm font-semibold text-slate-950">
                    실제 채점 기록
                  </h4>
                  <p className="text-xs leading-5 text-slate-600">
                    기존 채점기의 격리 환경에서 실행한 결과입니다. 전체 테스트를
                    통과해도 모든 입력에서 정답임을 보장하지는 않습니다.
                  </p>
                  <div className="grid min-w-0 gap-2">
                    {analysis.executions.map((run) => (
                      <details
                        key={run.submission_id}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                      >
                        <summary className="cursor-pointer leading-6">
                          <span className="font-semibold text-slate-950">
                            {name(run.artifact_id)}
                          </span>
                          {' · '}
                          {run.scope === 'probe'
                            ? '제안 반례 1개'
                            : run.scope === 'all'
                              ? `전체 ${run.testcase_count}개`
                              : `선택 ${run.testcase_count}개`}
                          {' · '}
                          <span
                            className={
                              run.status === 'accepted'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-800'
                            }
                          >
                            {verdicts[run.status] || run.status}
                          </span>
                          {run.failed_testcase_order
                            ? ` · 실패 #${run.failed_testcase_order}`
                            : ''}
                          {run.runtime_ms != null
                            ? ` · ${run.runtime_ms}ms`
                            : ''}
                          {run.memory_kb != null
                            ? ` · ${run.memory_kb.toLocaleString()}KB`
                            : ''}
                        </summary>
                        <div className="mt-2 grid min-w-0 gap-2 text-slate-600">
                          <p>
                            선택 범위:{' '}
                            {run.testcase_orders?.join(', ') ||
                              '등록된 모든 테스트케이스'}
                            {run.agent_version
                              ? ` · 채점기 ${run.agent_version}`
                              : ''}
                          </p>
                          <p className="break-all">
                            실행 번호: {run.submission_id}
                          </p>
                          <p>
                            실패 시 이후 테스트는 실행되지 않을 수 있습니다.
                          </p>
                          {run.probe ? (
                            <div className="grid min-w-0 gap-2 rounded bg-amber-50 p-2 text-amber-950">
                              <p>
                                기대 출력은 AI가 제안한 가설입니다. 공식
                                테스트에 등록되지 않았습니다. 별도
                                validator·참조 풀이 실행 여부는 반례 교차 검증
                                기록에서 확인하세요.
                              </p>
                              <BoundedText className="max-h-40 overflow-auto">{`입력\n${run.probe.input}\n제안 기대 출력\n${run.probe.expected_output}`}</BoundedText>
                            </div>
                          ) : null}
                          {run.compile_message || run.judge_message ? (
                            <BoundedText
                              tabIndex={0}
                              className="max-h-60 min-w-0 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100"
                            >
                              {[run.compile_message, run.judge_message]
                                .filter(Boolean)
                                .join('\n')}
                            </BoundedText>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}
              {analysis.artifacts?.map((item) => (
                <details
                  key={item.artifact_id}
                  className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                >
                  <summary className="cursor-pointer font-semibold text-slate-900">
                    {name(item.artifact_id)} 코드 · {item.language}
                    <span
                      className={
                        item.verification?.status === 'passed'
                          ? 'ml-2 text-emerald-700'
                          : 'ml-2 text-amber-800'
                      }
                    >
                      {item.verification
                        ? {
                            passed: '전체 등록 테스트 통과',
                            failed: '실행 검증 실패',
                            inconclusive: '추가 확인 필요',
                            pending: '실행 검증 중',
                            unverified: '미검증',
                          }[item.verification.status]
                        : '미검증'}
                    </span>
                  </summary>
                  <p className="mt-2 rounded bg-slate-50 p-2 leading-5 text-slate-700">
                    {item.verification?.message ||
                      '전체 등록 테스트 실행 근거가 확인되지 않은 코드입니다.'}
                  </p>
                  {item.verification?.unreplayed_probes ? (
                    <p className="mt-2 text-amber-800">
                      이 후보로 다시 실행하지 못한 제안 반례{' '}
                      {item.verification.unreplayed_probes}개
                    </p>
                  ) : null}
                  <p className="my-2 text-slate-600">
                    {item.purpose === 'comparison'
                      ? '원인을 비교하기 위한 실험용 코드입니다.'
                      : '별도로 보관한 수정 후보입니다.'}{' '}
                    원본 검증 코드는 유지됩니다. 위 실행 기록에서 판정과 테스트
                    범위를 확인하세요.
                  </p>
                  <a
                    className="mb-2 inline-block font-semibold text-indigo-700 underline"
                    download={`${item.artifact_id}.${({ python313: 'py', python311: 'py', cpp17: 'cpp', c99: 'c', java8: 'java', pypy3: 'py', kotlin: 'kt' } as Record<string, string>)[item.language] || 'txt'}`}
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(item.source)}`}
                  >
                    {item.purpose === 'comparison'
                      ? '대조 코드 다운로드'
                      : '수정 후보 다운로드'}
                  </a>
                  <BoundedText
                    aria-label={`${name(item.artifact_id)} 코드`}
                    tabIndex={0}
                    className="max-h-80 min-w-0 overflow-auto rounded bg-slate-900 p-3 leading-6 text-slate-100"
                  >
                    {item.source}
                  </BoundedText>
                </details>
              ))}

              {!analysis.executions?.length &&
              !analysis.playground_runs?.length &&
              !analysis.probe_checks?.length &&
              !analysis.artifacts?.length ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  아직 실행 기록이 없습니다. 실행을 마치면 여기에 표시됩니다.
                </p>
              ) : null}
            </div>
          </div>
          <div hidden={view !== 'activity'}>
            <div className="grid min-w-0 gap-4">
              {analysis.plan?.length ? (
                <section className="grid gap-2 rounded-lg border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-950">
                    검증 계획
                  </h4>
                  <ol className="grid gap-2 text-sm text-slate-700">
                    {analysis.plan.map((step, i) => (
                      <li className="flex gap-2" key={i}>
                        <span
                          className={
                            step.status === 'in_progress'
                              ? 'font-semibold text-indigo-700'
                              : 'text-slate-500'
                          }
                        >
                          {step.status === 'done'
                            ? '완료'
                            : step.status === 'in_progress'
                              ? '진행'
                              : '예정'}
                        </span>
                        <span className="min-w-0 break-words">
                          {step.title}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {analysis.findings?.length ? (
                <section className="grid gap-2">
                  <h4 className="text-sm font-semibold text-slate-950">
                    확인한 사실과 가설
                  </h4>
                  {analysis.findings.map((finding) => (
                    <details
                      key={finding.id}
                      className="rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <summary className="cursor-pointer font-medium text-slate-900">
                        <span className="mr-2 text-xs text-indigo-700">
                          {
                            {
                              confirmed: '근거 확인',
                              hypothesis: '가설',
                              rejected: '기각',
                            }[finding.status]
                          }
                        </span>
                        {finding.title}
                      </summary>
                      <VerificationMarkdown>
                        {finding.detail}
                      </VerificationMarkdown>
                      {finding.evidence_refs.length ? (
                        <p className="mt-2 text-xs break-all text-slate-500">
                          근거: {finding.evidence_refs.join(' · ')}
                        </p>
                      ) : null}
                    </details>
                  ))}
                </section>
              ) : null}

              <section className="min-w-0 rounded-lg border border-slate-200 p-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-900">
                  도구 실행 로그
                </h4>
                <ol className="grid divide-y divide-slate-100 text-slate-700">
                  {analysis.trace?.map((event, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 py-2.5 text-xs leading-6 break-words"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] text-slate-500"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-900">
                          {tools[event.tool] || event.tool}
                        </span>{' '}
                        ·{' '}
                        {event.status === 'error'
                          ? '확인 필요'
                          : event.status === 'waiting'
                            ? '요청'
                            : '완료'}{' '}
                        {event.detail && event.detail !== '완료' ? (
                          <p className="break-words text-slate-500">
                            {event.detail}
                          </p>
                        ) : null}
                      </div>
                      {event.at && !Number.isNaN(Date.parse(event.at)) ? (
                        <time
                          dateTime={event.at}
                          className="shrink-0 font-mono text-[10px] text-slate-400"
                        >
                          {new Date(event.at).toLocaleTimeString('ko-KR', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </time>
                      ) : null}
                    </li>
                  ))}
                </ol>

                {!analysis.trace?.length ? (
                  <p className="text-xs text-slate-500">
                    아직 기록된 작업이 없습니다.
                  </p>
                ) : null}
              </section>
            </div>
          </div>
          <div hidden={view !== 'resources'}>
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-white p-3 text-xs">
                <p className="font-semibold text-indigo-900">
                  {analysis.phase || '검증 준비'}
                </p>
                {analysis.usage ? (
                  <p className="text-slate-600">
                    입력 {analysis.usage.input_tokens.toLocaleString()}
                    {analysis.limits?.max_input_tokens
                      ? ` / ${analysis.limits.max_input_tokens.toLocaleString()}`
                      : ''}
                    {' · '}출력 {analysis.usage.output_tokens.toLocaleString()}
                    {analysis.limits?.max_output_tokens
                      ? ` / ${analysis.limits.max_output_tokens.toLocaleString()}`
                      : ''}{' '}
                    토큰
                    {' · '}예상 ${analysis.usage.estimated_cost_usd.toFixed(4)}
                    {analysis.limits
                      ? ` / 한도 $${analysis.limits.max_cost_usd.toFixed(2)}`
                      : ''}
                  </p>
                ) : null}
              </div>
              {analysis.limits?.max_calls ? (
                <p className="text-xs text-slate-500">
                  모델 호출 {analysis.calls ?? 0}/{analysis.limits.max_calls}회
                  {analysis.usage?.cached_input_tokens
                    ? ` · 캐시 재사용 입력 ${analysis.usage.cached_input_tokens.toLocaleString()}개`
                    : ''}
                </p>
              ) : null}
              <p className="text-xs leading-5 text-slate-500">
                {analysis.limits?.max_input_tokens ||
                analysis.limits?.max_output_tokens
                  ? '과거 분석에 적용된 토큰 한도입니다. 새 분석은 누적 토큰 제한 없이 예상 비용으로 통제합니다.'
                  : '토큰 수는 누적 사용량 통계입니다. 누적 토큰 제한 없이 다음 요청과 보고서 작성 비용을 포함한 예상 비용으로 통제합니다.'}
              </p>
              {analysis.stop_reason ? (
                <p
                  role="status"
                  className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900"
                >
                  {analysis.stop_reason.message}
                </p>
              ) : null}
              {analysis.usage?.by_model ? (
                <p className="mt-2 text-slate-600">
                  {Object.entries(analysis.usage.by_model)
                    .map(([name, usage]) => `${name} ${usage.calls}회`)
                    .join(' · ')}
                </p>
              ) : null}
              {analysis.workspace_files?.length ? (
                <details className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-900">
                    저장된 작업 파일 {analysis.workspace_files.length}개
                  </summary>
                  <ul className="mt-2 grid gap-1 text-slate-600">
                    {analysis.workspace_files.map((file) => (
                      <li key={file.path} className="break-all">
                        {file.path} · {file.bytes.toLocaleString()}바이트
                        {file.read_only ? ' · 읽기 전용 채점 파일' : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <section className="min-w-0 rounded-lg border border-slate-200 p-3 text-xs">
                <h4 className="font-semibold text-slate-900">확인한 자료</h4>
                <p className="mt-2 leading-6 text-slate-500">
                  필요한 파일의 일부만 읽을 수 있습니다. 아래에 없는 자료까지
                  검토한 것으로 간주하지 마세요.
                </p>
                {analysis.files_read?.length ? (
                  <ul className="my-2 space-y-1 text-slate-600">
                    {analysis.files_read.map((file, index) => (
                      <li key={index} className="break-all">
                        {file.file_id} ·{' '}
                        {file.image_attached
                          ? '이미지 확인'
                          : file.complete
                            ? '전체 읽음'
                            : file.offset != null
                              ? `${file.offset}바이트부터 부분 읽음`
                              : '문자열 검색'}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!analysis.files_read?.length ? (
                  <p className="mt-2 text-slate-500">
                    아직 읽은 자료가 없습니다.
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
