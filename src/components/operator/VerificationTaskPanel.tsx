import Select from '@/shared/ui/Select';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError } from '@/shared/api/errors';
import {
  listVerificationTasks,
  getVerificationTask,
  createVerificationTask,
  stopVerificationTask,
  downloadTaskWorkspace,
  type VerificationTask,
} from '@/domains/problemManagement/verificationTasks';
import VerificationAgentEvidence from './VerificationAgentEvidence';
import { ReportBody } from './VerificationAnalysisPanel';

const active = (status?: string) => status === 'queued' || status === 'running';
const statuses: Record<string, string> = {
  queued: '대기 중',
  running: '작업 중',
  succeeded: '완료',
  failed: '실패',
  awaiting_input: '답변 필요',
  stopped: '중지됨',
};
const examples = [
  '현재 테스트에서 놓치고 있는 경계값을 찾고, 기준 풀이와 대조 실험해 줘.',
  '등록된 checker를 수정하지 말고 잘못된 출력을 통과시키는지 반례로 확인해 줘.',
  '등록된 validator를 수정하지 말고 입력 조건을 정확히 검사하는지 실행해서 확인해 줘.',
];
const button =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 hover:bg-slate-50';

export default function VerificationTaskPanel({
  contestId,
  problemId,
  token,
}: {
  contestId: string;
  problemId: string;
  token: string;
}) {
  const client = useQueryClient();
  const goalInput = useRef<HTMLTextAreaElement>(null);
  const identity = tokenQueryIdentity(token);
  const key = [
    'operator',
    'verification-tasks',
    contestId,
    problemId,
    identity,
  ];
  const [goal, setGoal] = useState('');
  const [source, setSource] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [continuing, setContinuing] = useState<VerificationTask | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: () => listVerificationTasks(contestId, problemId, token),
    refetchInterval: (query) =>
      query.state.data?.tasks.some((t) => active(t.analysis.status))
        ? 3000
        : false,
  });
  const selected = selectedId || list.data?.tasks[0]?.task_id || '';
  const detailKey = [...key, selected];
  const detail = useQuery({
    queryKey: detailKey,
    enabled: Boolean(selected),
    queryFn: () => getVerificationTask(contestId, problemId, selected, token),
    refetchInterval: (query) =>
      active(query.state.data?.analysis.status) ? 2500 : false,
  });
  const task = detail.data;
  const analysis = task?.analysis;
  const runningCount =
    list.data?.tasks.filter((t) => active(t.analysis.status)).length ?? 0;
  const writable = Boolean(list.data?.available && list.data.can_run);
  const save = (value: VerificationTask) => {
    setSelectedId(value.task_id);
    client.setQueryData([...key, value.task_id], value);
    void client.invalidateQueries({ queryKey: key, exact: true });
  };
  const create = useMutation({
    mutationFn: () =>
      createVerificationTask(contestId, problemId, token, {
        goal,
        source_asset_id: source || null,
        parent_task_id: continuing?.task_id || null,
      }),
    onSuccess: (value) => {
      save(value);
      setGoal('');
      setContinuing(null);
    },
  });
  const stop = useMutation({
    mutationFn: () =>
      stopVerificationTask(contestId, problemId, selected, token),
    onSuccess: save,
  });
  const download = useMutation({
    mutationFn: () =>
      downloadTaskWorkspace(contestId, problemId, selected, token),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'verification-workspace.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const error =
    create.error || stop.error || download.error || detail.error || list.error;
  return (
    <section
      aria-label="문제별 검증 에이전트"
      className="grid min-w-0 gap-5 rounded-xl border border-indigo-100 bg-white p-4 sm:p-5"
    >
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold text-slate-950">검증 에이전트</h3>
        <p className="text-sm leading-6 text-slate-600">
          확인할 상황과 목표를 맡겨 주세요. 저장된 이 문제의 자료를 찾아 계획을
          세우고, 필요한 코드를 작성·실행하며 근거를 모읍니다. 화면을 닫아도
          작업은 계속됩니다.
        </p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (writable && goal.trim().length >= 5) create.mutate();
        }}
      >
        {continuing ? (
          <div className="flex items-start justify-between gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
            <p className="min-w-0 break-words">
              이전 작업에서 이어서 요청: {continuing.goal}
            </p>
            <button
              type="button"
              className="shrink-0 underline"
              onClick={() => setContinuing(null)}
            >
              새 작업으로 전환
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {examples.map((example, i) => (
              <button
                key={example}
                type="button"
                disabled={!writable}
                className={button + ' text-xs'}
                onClick={() => setGoal(example)}
              >
                {['경계값 찾기', 'checker 검증', 'validator 검증'][i]}
              </button>
            ))}
          </div>
        )}
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          {continuing?.analysis.question ? '에이전트에게 답변' : '검증 요청'}
          <textarea
            ref={goalInput}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={!writable || create.isPending}
            placeholder="예: 두 정답 풀이의 결과가 다릅니다. 원인을 찾고 작은 반례로 재현한 뒤 수정안을 검증해 주세요."
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm leading-6 font-normal disabled:bg-slate-50"
          />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3">
          {!continuing ? (
            <label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600">
              중점 검토할 코드 (선택)
              <Select
                className="max-w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={!writable}
              >
                <option value="">목표에 따라 에이전트가 선택</option>
                {list.data?.sources.map((item) => (
                  <option key={item.asset_id} value={item.asset_id}>
                    {item.filename}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <p className="text-xs text-slate-500">
              이전 결과와 작업 파일을 이어받습니다.
            </p>
          )}
          <button
            type="submit"
            disabled={!writable || create.isPending || goal.trim().length < 5}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            {create.isPending
              ? '작업 등록 중…'
              : continuing
                ? '이어서 검증 요청'
                : '검증 맡기기'}
          </button>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          요청당 예상 API 비용 한도 $
          {list.data?.limits.max_cost_usd.toFixed(2) ?? '1.00'}. 같은
          자료·요청은 저장 결과를 재사용합니다. 이어서 요청하면 별도 예산으로
          작업합니다. testlib.h·checker·validator는 원본 그대로 검증합니다.
        </p>
        {list.data && !list.data.available ? (
          <p className="text-sm text-amber-800">
            서버의 검증 에이전트 연결을 확인해 주세요. 저장된 작업은 계속 볼 수
            있습니다.
          </p>
        ) : null}
        {list.data && !list.data.can_run ? (
          <p className="text-sm text-slate-600">
            작업 요청·중지에는 문제 테스트 권한이 필요합니다.
          </p>
        ) : null}
        {runningCount > 0 ? (
          <p role="status" className="text-xs text-indigo-700">
            이 문제에서 {runningCount}개 작업이 진행 중입니다. 새 작업을 함께
            요청할 수 있으며, 서버에서 최대 {list.data?.limits.concurrency ?? 3}
            개를 동시에 처리합니다.
          </p>
        ) : null}
      </form>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {formatApiError(error, '검증 작업을 처리하지 못했습니다.')}
        </p>
      ) : null}
      {list.isLoading ? (
        <p role="status" className="text-sm text-slate-500">
          공유 작업을 불러오는 중입니다.
        </p>
      ) : null}
      {list.data?.tasks.length ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
          <nav
            aria-label="검증 작업 기록"
            className="grid max-h-96 gap-2 overflow-y-auto"
          >
            {list.data.tasks.map((item) => (
              <button
                type="button"
                key={item.task_id}
                aria-current={selected === item.task_id ? 'true' : undefined}
                onClick={() => setSelectedId(item.task_id)}
                className={
                  'grid gap-1 rounded-lg border p-3 text-left text-sm ' +
                  (selected === item.task_id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 bg-white')
                }
              >
                <span className="line-clamp-2 font-medium break-words text-slate-900">
                  {item.goal}
                </span>
                <span className="text-xs text-slate-600">
                  {statuses[item.analysis.status]} ·{' '}
                  {new Date(item.analysis.created_at).toLocaleString('ko-KR')}
                </span>
              </button>
            ))}
          </nav>
          <div className="grid min-w-0 gap-4">
            {detail.isLoading ? (
              <p role="status">작업 기록을 불러오는 중입니다.</p>
            ) : null}
            {task && analysis ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <h4 className="font-semibold break-words text-slate-950">
                      {task.goal}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {statuses[analysis.status]} · 운영자 공유
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {writable && active(analysis.status) ? (
                      <button
                        type="button"
                        className={button}
                        disabled={stop.isPending || task.cancel_requested}
                        onClick={() => stop.mutate()}
                      >
                        {task.cancel_requested ? '중지 요청됨' : '작업 중지'}
                      </button>
                    ) : null}
                    {writable && !active(analysis.status) && !task.stale ? (
                      <button
                        type="button"
                        className={button}
                        onClick={() => {
                          setContinuing(task);
                          setGoal('');
                          goalInput.current?.focus();
                          goalInput.current?.scrollIntoView?.({
                            block: 'center',
                            behavior: 'smooth',
                          });
                        }}
                      >
                        {analysis.question
                          ? '질문에 답변하기'
                          : '이 작업에서 이어서 요청'}
                      </button>
                    ) : null}
                    {analysis.workspace_files?.length ? (
                      <button
                        type="button"
                        className={button}
                        disabled={download.isPending}
                        onClick={() => download.mutate()}
                      >
                        작업 파일 다운로드
                      </button>
                    ) : null}
                  </div>
                </div>
                {analysis.report ? (
                  <ReportBody report={analysis.report} analysis={analysis} />
                ) : null}
                {!analysis.report && active(analysis.status) ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="grid gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-indigo-500 motion-safe:animate-pulse"
                      />
                      {analysis.status === 'queued'
                        ? '분석 대기 중'
                        : analysis.phase || '분석 진행 중'}
                    </p>
                    <p className="text-xs leading-6 text-slate-600">
                      분석이 끝나면 이곳에 요약과 권장 조치가 표시됩니다. 화면을
                      닫아도 작업은 계속됩니다.
                    </p>
                  </div>
                ) : null}
                {analysis.stop_reason ? (
                  <p
                    role="status"
                    className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900"
                  >
                    {analysis.stop_reason.message}
                  </p>
                ) : null}
                {task.cancel_requested && active(analysis.status) ? (
                  <p role="status" className="text-sm text-amber-800">
                    이미 시작한 단계가 끝나면 중지합니다. 실행 기록과 파일은
                    보존합니다.
                  </p>
                ) : null}
                {task.stale ? (
                  <p className="text-sm text-amber-800">
                    작업 이후 문제 자료가 변경됐습니다. 최신 자료로 새 작업을
                    시작해 주세요.
                  </p>
                ) : null}
                {analysis.question ? (
                  <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h5 className="font-semibold text-amber-950">
                      에이전트가 확인을 요청했습니다
                    </h5>
                    <p className="text-sm whitespace-pre-wrap">
                      {analysis.question.question}
                    </p>
                    <p className="text-xs text-amber-900">
                      {analysis.question.reason}
                    </p>
                  </div>
                ) : null}
                {analysis.error_message ? (
                  <p role="alert" className="text-sm text-rose-700">
                    {analysis.error_message}
                  </p>
                ) : null}
                {analysis.outcome === 'inconclusive' ? (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    아직 결론을 확정하지 못했습니다. 확인한 범위와 남은 제한을
                    검토한 뒤 필요한 작업을 이어서 요청해 주세요.
                  </p>
                ) : null}
                <VerificationAgentEvidence
                  key={task.task_id}
                  analysis={analysis}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : !list.isLoading ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          아직 맡긴 검증 작업이 없습니다. 위에 상황과 목표를 적어 시작해 보세요.
        </p>
      ) : null}
    </section>
  );
}
