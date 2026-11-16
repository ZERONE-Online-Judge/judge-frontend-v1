import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminPanel } from '@/components/admin/AdminShell';
import {
  editorJobCategories,
  editorJobCategory,
  editorJobDate,
  editorJobPending,
  editorJobProgress,
  editorJobResult,
  editorJobStatuses,
  editorJobStatus,
  getAdminEditorJob,
  listAdminEditorJobs,
  type EditorJob,
} from '@/domains/auditMonitoring/editorJobs';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError, isApiClientError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import { useClockTick } from '@/shared/hooks/useAutoRefresh';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/dateTime';
import { formatMemoryKb } from '@/shared/lib/formatters';
import BoundedText from '@/shared/ui/BoundedText';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import {
  MotionProgress,
  MotionProgressText,
  ResultTransition,
} from '@/shared/ui/ProgressMotion';
import Select from '@/shared/ui/Select';

export default function EditorJobHistory({ token }: { token: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const visible = useDocumentVisibility();
  const now = useClockTick();
  const identity = tokenQueryIdentity(token);
  const jobs = useQuery({
    queryKey: ['admin', 'editor-jobs', identity, { page, q, category, status }],
    queryFn: () => listAdminEditorJobs(token, { page, q, category, status }),
    placeholderData: () => undefined,
    refetchInterval: (query) =>
      visible && !accessDenied(query.state.error) ? 5_000 : false,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['admin', 'editor-job', identity, selected],
    queryFn: () => getAdminEditorJob(token, selected!),
    enabled: Boolean(selected),
    placeholderData: () => undefined,
    retry: false,
    refetchInterval: (query) =>
      visible &&
      !accessDenied(query.state.error) &&
      query.state.data &&
      editorJobPending(query.state.data)
        ? 1_500
        : false,
  });

  const data = accessDenied(jobs.error) ? undefined : jobs.data;
  const selectedData = accessDenied(detail.error) ? undefined : detail.data;
  const currentPage = data?.page ?? page;

  return (
    <>
      <AdminPanel
        title="작업 내역 (Editor)"
        description="에디터에서 실행한 검증·스트레스 테스트·패키지 생성 기록입니다. 코드와 파일 내용을 제외한 실행 기록을 표시합니다."
        actions={
          <button
            type="button"
            className="admin-action"
            disabled={jobs.isFetching}
            onClick={() => {
              void jobs.refetch();
              if (selected) void detail.refetch();
            }}
          >
            {jobs.isFetching ? '갱신 중' : '새로고침'}
          </button>
        }
      >
        <form
          className="mb-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
        >
          <label className="grid min-w-48 flex-1 gap-1.5 text-xs font-medium text-slate-600">
            문제·요청자 검색
            <input
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="문제 이름, 실행 이름, 요청자 이름·이메일"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            작업 종류
            <Select
              aria-label="에디터 작업 종류"
              value={category}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              {editorJobCategories.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            실행 상태
            <Select
              aria-label="에디터 실행 상태"
              value={status}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {editorJobStatuses.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className="admin-action">
            검색
          </button>
        </form>
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>
            {data
              ? `검색 결과 ${data.total.toLocaleString('ko-KR')}건`
              : '작업 기록'}{' '}
            · 최신순
          </span>
          <span>5초마다 자동 새로고침</span>
        </div>
        {jobs.error ? (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
          >
            {formatApiError(
              jobs.error,
              '에디터 작업 내역을 불러오지 못했습니다',
            )}
          </p>
        ) : null}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr>
                {[
                  '문제',
                  '요청자',
                  '작업',
                  '결과',
                  '리비전',
                  '요청 시각',
                  '보기',
                ].map((label) => (
                  <th
                    key={label}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-slate-100 align-top"
                >
                  <td className="max-w-64 px-4 py-4">
                    <p className="font-semibold break-words text-slate-900">
                      {job.problem?.name || '삭제된 문제'}
                    </p>
                    <p className="mt-1 text-xs break-all text-slate-500">
                      {job.problem?.slug || job.id.slice(0, 8)}
                      {job.problem?.deleted ? ' · 삭제됨' : ''}
                    </p>
                  </td>
                  <td className="max-w-56 px-4 py-4">
                    <p className="font-medium break-words">{requester(job)}</p>
                    <p className="mt-1 text-xs break-all text-slate-500">
                      {job.requester?.email || '-'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p>{editorJobCategory(job)}</p>
                    {job.name ? (
                      <p className="mt-1 max-w-48 text-xs break-words text-slate-500">
                        {job.name}
                      </p>
                    ) : null}
                  </td>
                  <td className="min-w-40 px-4 py-4">
                    <JobResult job={job} />
                  </td>
                  <td className="px-4 py-4 text-slate-600">r{job.revision}</td>
                  <td className="px-4 py-4">
                    <JobTime at={job.created_at} now={now} />
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      className="admin-action"
                      aria-label={`${job.problem?.name || '문제'} ${editorJobCategory(job)} 작업 상세`}
                      onClick={() => setSelected(job.id)}
                    >
                      자세히
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.items.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    {jobs.isPending
                      ? '에디터 작업 내역을 불러오는 중입니다.'
                      : jobs.error
                        ? '잠시 후 다시 불러와 주세요.'
                        : '조건에 맞는 에디터 작업이 없습니다.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {currentPage} / {Math.max(1, data?.pages ?? currentPage)} 페이지
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="admin-action"
              disabled={currentPage <= 1 || jobs.isFetching}
              onClick={() => setPage(currentPage - 1)}
            >
              이전
            </button>
            <button
              type="button"
              className="admin-action"
              disabled={!data || currentPage >= data.pages || jobs.isFetching}
              onClick={() => setPage(currentPage + 1)}
            >
              다음
            </button>
          </div>
        </div>
      </AdminPanel>
      {selected ? (
        <ModalDialog
          aria-label="에디터 작업 상세"
          size="wide"
          fill
          customBody
          eyebrow={`Editor 작업 · ${selected.slice(0, 8)}`}
          title={
            selectedData
              ? `${editorJobCategory(selectedData)} · ${selectedData.problem?.name || '삭제된 문제'}`
              : '에디터 작업 상세'
          }
          description={selectedData ? requester(selectedData) : undefined}
          headerActions={
            <ModalButton
              disabled={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              새로고침
            </ModalButton>
          }
          onClose={() => setSelected(null)}
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
            {detail.error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700"
              >
                {formatApiError(
                  detail.error,
                  '에디터 작업 상세를 불러오지 못했습니다',
                )}
              </p>
            ) : selectedData ? (
              <JobDetail job={selectedData} now={now} />
            ) : (
              <p
                role="status"
                className="py-10 text-center text-sm text-slate-500"
              >
                작업 상세를 불러오는 중입니다.
              </p>
            )}
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}

function accessDenied(error: unknown) {
  return isApiClientError(error) && [401, 403].includes(error.status);
}

function requester(job: EditorJob) {
  return (
    job.requester?.display_name ||
    job.requester?.handle ||
    job.requester?.email ||
    '알 수 없는 요청자'
  );
}

function JobTime({ at, now }: { at: number | null; now: number }) {
  const value = editorJobDate(at);
  return (
    <time
      dateTime={value}
      className="block text-xs whitespace-nowrap text-slate-600"
    >
      {formatDateTime(value)}
      {value && now > 0 ? (
        <span className="mt-1 block text-slate-400">
          {formatRelativeTime(value, now)}
        </span>
      ) : null}
    </time>
  );
}

function JobResult({ job }: { job: EditorJob }) {
  const assessment = job.outcome?.assessment;
  const tone =
    job.status === 'failed' || assessment?.status === 'failed'
      ? 'bg-rose-50 text-rose-700'
      : editorJobPending(job)
        ? 'bg-indigo-50 text-indigo-700'
        : assessment?.code === 'detail_required'
          ? 'bg-slate-100 text-slate-600'
          : assessment?.status === 'passed'
            ? 'bg-emerald-50 text-emerald-700'
            : assessment &&
                ['incomplete', 'unknown', 'not_run'].includes(assessment.status)
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-600';
  return (
    <div className="grid gap-2">
      <ResultTransition
        stateKey={`${job.id}:${job.status}:${assessment?.code}`}
      >
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
        >
          {editorJobResult(job)}
        </span>
      </ResultTransition>
      {assessment?.code === 'detail_required' ? (
        <span className="text-xs text-slate-500">상세에서 판정 확인</span>
      ) : null}
      {editorJobPending(job) ? (
        <div className="grid gap-1.5">
          <MotionProgress
            label="에디터 작업 진행률"
            scope={job.id}
            value={editorJobProgress(job)}
            fillClassName="bg-indigo-600"
          />
          <span className="text-xs text-slate-500">
            <MotionProgressText
              scope={job.id}
              text={
                editorJobProgress(job) == null
                  ? editorJobStatus(job.status)
                  : `${editorJobProgress(job)}%`
              }
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function JobDetail({ job, now }: { job: EditorJob; now: number }) {
  const assessment = job.outcome?.assessment;
  const summary =
    typeof job.result.summary === 'string' ? job.result.summary : '';
  return (
    <div className="grid min-w-0 gap-5">
      <section className="zoj-card grid gap-4" aria-label="에디터 실행 결과">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">실행 결과</h3>
          <JobResult job={job} />
        </div>
        {summary ? (
          <p className="text-sm leading-6 break-words whitespace-pre-wrap text-slate-700">
            {summary}
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            {editorJobPending(job)
              ? '작업이 끝나면 실행 결과를 표시합니다.'
              : '이 기록에는 결과 요약이 없습니다.'}
          </p>
        )}
        {assessment?.counts ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="검사 항목">{assessment.counts.total}</Info>
            <Info label="통과·일치">{assessment.counts.passed}</Info>
            <Info label="불통과·불일치">{assessment.counts.failed}</Info>
            <Info label="미확인">{assessment.counts.unconfirmed}</Info>
          </dl>
        ) : null}
        {assessment?.iterations != null ? (
          <p className="text-sm text-slate-600">
            {assessment.iterations.toLocaleString('ko-KR')}회 탐색 · 반례{' '}
            {(assessment.found ?? 0).toLocaleString('ko-KR')}개
          </p>
        ) : null}
      </section>
      <SolutionResults result={job.result} />
      <section className="zoj-card" aria-label="에디터 작업 정보">
        <dl className="grid gap-5 sm:grid-cols-2">
          {job.name ? <Info label="실행 이름">{job.name}</Info> : null}
          <Info label="작업 종류">
            {editorJobCategory(job)} · {editorJobStatus(job.status)}
          </Info>
          <Info label="요청자">
            {requester(job)}
            {job.requester?.email ? (
              <span className="mt-1 block text-xs text-slate-500">
                {job.requester.email}
              </span>
            ) : null}
          </Info>
          <Info label="문제">
            {job.problem?.name || '삭제된 문제'}
            {job.problem?.deleted ? ' · 삭제됨' : ''}
          </Info>
          <Info label="실행 기준">
            리비전 r{job.revision} · 작업 사본 v{job.workspace_version}
          </Info>
          <Info label="요청 시각">
            <JobTime at={job.created_at} now={now} />
          </Info>
          <Info label="시작 시각">
            <JobTime at={job.started_at} now={now} />
          </Info>
          <Info label="종료 시각">
            <JobTime at={job.finished_at} now={now} />
          </Info>
          <Info label="작업 ID">
            <span className="font-mono text-xs break-all select-all">
              {job.id}
            </span>
          </Info>
        </dl>
      </section>
      {job.options && Object.keys(job.options).length ? (
        <details className="zoj-inset">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            실행 설정
          </summary>
          <JsonBlock value={job.options} label="실행 설정 데이터" />
        </details>
      ) : null}
      {job.result_truncated ? (
        <p role="status" className="text-xs text-amber-700">
          결과가 많아 일부 항목만 표시합니다.
        </p>
      ) : null}
      <details className="zoj-inset">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          상세 실행 결과
        </summary>
        <JsonBlock value={job.result} label="상세 실행 결과 데이터" />
      </details>
    </div>
  );
}

function SolutionResults({ result }: { result: EditorJob['result'] }) {
  const raw =
    Array.isArray(result.solutions) && result.solutions.length
      ? result.solutions
      : result.stress_results;
  const solutions = Array.isArray(raw)
    ? raw.filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === 'object' && !Array.isArray(value),
      )
    : [];
  if (!solutions.length) return null;
  const labels: Record<string, string> = {
    OK: '정답',
    AC: '정답',
    WA: '오답',
    TL: '시간 초과',
    TM: '시간 초과',
    TO: '시간 초과',
    TLE: '시간 초과',
    ML: '메모리 초과',
    MLE: '메모리 초과',
    RE: '런타임 오류',
    CE: '컴파일 오류',
    PE: '출력 형식 오류',
    PARTIAL: '부분 점수',
    OLE: '출력 초과',
    IDLENESS_LIMIT: '응답 시간 초과',
  };
  const verdict = (value: unknown) =>
    typeof value === 'string' ? labels[value] || value : '-';
  return (
    <section className="zoj-card min-w-0" aria-label="풀이별 실행 결과">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">
        풀이별 실행 결과
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-xs">
          <thead>
            <tr>
              {[
                '풀이',
                '기대 판정',
                '실제 판정',
                '검사 결과',
                '최대 시간',
                '최대 메모리',
              ].map((label) => (
                <th
                  key={label}
                  className="border-b border-slate-200 px-3 py-3 font-medium text-slate-500"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solutions.map((solution, index) => (
              <tr key={index} className="border-b border-slate-100 align-top">
                <td className="max-w-56 px-3 py-3 font-mono break-words text-slate-900">
                  {String(solution.name || `풀이 ${index + 1}`)}
                </td>
                <td className="px-3 py-3">{verdict(solution.tag)}</td>
                <td className="px-3 py-3">
                  {Array.isArray(solution.observed_verdicts) &&
                  solution.observed_verdicts.length
                    ? solution.observed_verdicts.map(verdict).join(' · ')
                    : '-'}
                </td>
                <td className="px-3 py-3">
                  {solution.matched === true
                    ? '예상 일치'
                    : solution.matched === false
                      ? '예상 불일치'
                      : '미확인'}
                  {typeof solution.completed_tests === 'number' ? (
                    <span className="mt-1 block text-slate-500">
                      {solution.completed_tests} /{' '}
                      {typeof solution.total_tests === 'number'
                        ? solution.total_tests
                        : '-'}
                      개 검사
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {typeof solution.max_cpu_ms === 'number'
                    ? `${solution.max_cpu_ms.toLocaleString('ko-KR')} ms`
                    : '-'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {formatMemoryKb(
                    typeof solution.max_memory_kb === 'number'
                      ? solution.max_memory_kb
                      : undefined,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium break-words text-slate-900">
        {children}
      </dd>
    </div>
  );
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <BoundedText
      aria-label={label}
      tabIndex={0}
      className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-6 whitespace-pre text-slate-100"
    >
      {JSON.stringify(value, null, 2)}
    </BoundedText>
  );
}
