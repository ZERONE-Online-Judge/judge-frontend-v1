import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import {
  OperatorAccessGate,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import ProblemStatementPanel from '@/components/contest/problem/ProblemStatementPanel';
import { hasProblemEditorial } from '@/domains/problemManagement/statementLanguages';
import ProblemEditorialPanel from '@/components/contest/problem/ProblemEditorialPanel';
import ProblemSubmitPanel from '@/components/contest/problem/ProblemSubmitPanel';
import ProblemReviewResult from '@/components/operator/ProblemReviewResult';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import {
  getOperatorProblems,
  getProblemAssets,
} from '@/domains/problemManagement/api';
import type { Problem } from '@/domains/problemManagement/types';
import useProblemReviewRuns, {
  isReviewRunPending,
  type ProblemReviewRun,
} from '@/domains/problemManagement/useProblemReviewRuns';
import {
  isJudgeLanguage,
  loadLastJudgeLanguage,
  saveLastJudgeLanguage,
} from '@/domains/submissionScoreboard/languagePreference';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';
import { formatUserApiError } from '@/shared/api/errors';
import { loadCodeDraft, saveCodeDraft } from '@/shared/lib/codeDraftStorage';

export default function OperatorProblemReviewPage() {
  const { contestId } = useParams();
  return (
    <OperatorAccessGate
      contestId={contestId}
      permission={['contest.problem.view', 'contest.problem.review']}
    >
      {(session) =>
        contestId ? (
          <ProblemReviewContent
            key={`${contestId}:${session.staff.email}:${hasContestPermission(session, contestId, 'contest.problem.test')}`}
            contestId={contestId}
            token={session.accessToken}
            reviewer={session.staff.email}
            canSubmit={hasContestPermission(
              session,
              contestId,
              'contest.problem.test',
            )}
            canViewEditorial={hasContestPermission(
              session,
              contestId,
              'contest.problem.resource.view',
            )}
          />
        ) : (
          <PageLayout variant="management" width="full" title="문제 모아보기">
            <p>확인할 대회를 먼저 선택해 주세요.</p>
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function ProblemReviewContent({
  contestId,
  token,
  reviewer,
  canSubmit,
  canViewEditorial,
}: {
  contestId: string;
  token: string;
  reviewer: string;
  canSubmit: boolean;
  canViewEditorial: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const identity = tokenQueryIdentity(token);
  const dashboard = useQuery({
    queryKey: ['operator', 'dashboard', contestId, identity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const problemsQuery = useQuery({
    queryKey: ['operator', 'problems', contestId, identity, canViewEditorial],
    queryFn: () => getOperatorProblems(contestId, token),
  });
  const { runs, submit, resume } = useProblemReviewRuns(contestId, token);
  const divisions = dashboard.data?.divisions ?? [];
  const divisionId = params.get('divisionId') ?? '';
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const divisionOrder = new Map(
    divisions.map((division, index) => [
      division.division_id,
      division.display_order ?? index,
    ]),
  );
  const problems = [...(problemsQuery.data ?? [])].sort(
    (a, b) =>
      (divisionOrder.get(a.division_id ?? '') ?? Number.MAX_SAFE_INTEGER) -
        (divisionOrder.get(b.division_id ?? '') ?? Number.MAX_SAFE_INTEGER) ||
      (a.display_order ?? 0) - (b.display_order ?? 0) ||
      a.problem_code.localeCompare(b.problem_code, 'ko', { numeric: true }),
  );
  const visibleProblems = problems.filter(
    (problem) =>
      (!divisionId || problem.division_id === divisionId) &&
      `${problem.problem_code} ${problem.title}`
        .toLocaleLowerCase()
        .includes(normalizedSearch),
  );
  const selected =
    visibleProblems.find(
      (problem) => problem.problem_id === params.get('problemId'),
    ) ?? visibleProblems[0];
  const selectedIndex = visibleProblems.findIndex(
    (problem) => problem.problem_id === selected?.problem_id,
  );
  const selectedRuns = runs.filter(
    (run) => run.problemId === selected?.problem_id,
  );
  const latestByProblem = new Map<string, ProblemReviewRun>();
  for (const run of runs)
    if (!latestByProblem.has(run.problemId))
      latestByProblem.set(run.problemId, run);

  function selectProblem(problem: Problem) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('problemId', problem.problem_id);
      return next;
    });
  }

  const error = problemsQuery.error || dashboard.error;
  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      width="full"
      title="문제 모아보기"
      eyebrow={dashboard.data?.contest.title ?? 'Operator'}
      description={
        canSubmit
          ? '문제와 예제를 읽고 직접 풀어보며 검수하세요. 테스트 제출은 참가팀 성적에 반영되지 않습니다.'
          : '참가 유형별 문제 지문, 예제와 첨부 이미지를 확인하세요.'
      }
    >
      <section className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
          참가 유형
          <select
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={divisionId}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value)
                next.set('divisionId', event.target.value);
              else next.delete('divisionId');
              next.delete('problemId');
              setParams(next);
            }}
          >
            <option value="">전체 유형</option>
            {divisions.map((division) => (
              <option key={division.division_id} value={division.division_id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium text-slate-600">
          문제 검색
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
            type="search"
            placeholder="문제 번호 또는 제목"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="py-2.5 text-xs text-slate-500" role="status">
          {visibleProblems.length} / {problems.length}문제
        </span>
      </section>
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <p>{formatUserApiError(error, '문제를 불러오지 못했습니다.')}</p>
          <button
            className="font-medium underline underline-offset-4"
            type="button"
            onClick={() => {
              void dashboard.refetch();
              void problemsQuery.refetch();
            }}
          >
            다시 불러오기
          </button>
        </div>
      ) : null}
      {problemsQuery.isPending || dashboard.isPending ? (
        <p role="status" className="py-12 text-center text-sm text-slate-500">
          문제를 불러오는 중입니다.
        </p>
      ) : selected ? (
        <div className="operator-review-layout">
          <aside aria-label="문제 목록" className="operator-review-index">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-slate-900">
                문제 목록
              </h2>
              <span className="text-xs text-slate-400">
                {visibleProblems.length}개
              </span>
            </div>
            <div className="grid max-h-60 gap-1.5 overflow-y-auto lg:max-h-[calc(100dvh-10rem)]">
              {visibleProblems.map((problem) => {
                const latest = latestByProblem.get(problem.problem_id);
                const selectedProblem =
                  selected.problem_id === problem.problem_id;
                const division = divisions.find(
                  (item) => item.division_id === problem.division_id,
                );
                return (
                  <button
                    key={problem.problem_id}
                    type="button"
                    aria-current={selectedProblem ? 'true' : undefined}
                    onClick={() => selectProblem(problem)}
                    className={`grid min-w-0 gap-1.5 rounded-lg border px-3 py-3 text-left ${selectedProblem ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}
                  >
                    <span
                      className={`text-sm font-medium break-words ${selectedProblem ? 'text-indigo-800' : 'text-slate-800'}`}
                    >
                      {problem.problem_code}. {problem.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      {division?.name ?? '공통 문제'}
                    </span>
                    {latest ? (
                      <span
                        className={`text-xs ${latest.submission?.status === 'accepted' && !latest.error ? 'text-emerald-700' : 'text-slate-500'}`}
                      >
                        {runLabel(latest)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {selectedIndex + 1} / {visibleProblems.length} ·{' '}
                {divisions.find(
                  (division) => division.division_id === selected.division_id,
                )?.name ?? '공통 문제'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={navigationButton}
                  disabled={selectedIndex === 0}
                  onClick={() =>
                    selectProblem(visibleProblems[selectedIndex - 1])
                  }
                >
                  이전 문제
                </button>
                <button
                  type="button"
                  className={navigationButton}
                  disabled={selectedIndex === visibleProblems.length - 1}
                  onClick={() =>
                    selectProblem(visibleProblems[selectedIndex + 1])
                  }
                >
                  다음 문제
                </button>
              </div>
            </div>
            <ReviewWorkspace
              key={selected.problem_id}
              contestId={contestId}
              token={token}
              reviewer={reviewer}
              canSubmit={canSubmit}
              canViewEditorial={canViewEditorial}
              problem={selected}
              runs={selectedRuns}
              onSubmit={(language, code) => {
                if (canSubmit) submit(selected.problem_id, language, code);
              }}
              onResume={resume}
            />
          </div>
        </div>
      ) : !error ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-16 text-sm text-slate-500">
          <p>
            {problems.length
              ? '조건에 맞는 문제가 없습니다.'
              : '등록된 문제가 없습니다.'}
          </p>
          {problems.length ? (
            <button
              className="font-medium text-indigo-600"
              type="button"
              onClick={() => {
                setSearch('');
                setParams({});
              }}
            >
              전체 문제 보기
            </button>
          ) : null}
        </div>
      ) : null}
    </PageLayout>
  );
}

const navigationButton =
  'h-9 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

function ReviewWorkspace({
  contestId,
  token,
  reviewer,
  problem,
  runs,
  onSubmit,
  onResume,
  canSubmit,
  canViewEditorial,
}: {
  contestId: string;
  token: string;
  reviewer: string;
  problem: Problem;
  runs: ProblemReviewRun[];
  onSubmit: (language: JudgeLanguage, code: string) => void;
  onResume: (run: ProblemReviewRun) => void;
  canSubmit: boolean;
  canViewEditorial: boolean;
}) {
  const draftScope = `operator-review:${reviewer}:${contestId}`;
  const [draft, setDraft] = useState(() => {
    const saved = loadCodeDraft(draftScope, problem.problem_id);
    let language: JudgeLanguage = 'cpp17';
    try {
      language = loadLastJudgeLanguage();
    } catch {
      /* Storage may be unavailable. */
    }
    return {
      sourceCode: saved?.sourceCode ?? '',
      language: isJudgeLanguage(saved?.language) ? saved.language! : language,
    };
  });
  const [selectedRunId, setSelectedRunId] = useState('');
  const assets = useQuery({
    queryKey: [
      'operator',
      'problem-assets',
      contestId,
      problem.problem_id,
      tokenQueryIdentity(token),
      canViewEditorial,
    ],
    queryFn: () => getProblemAssets(contestId, problem.problem_id, token),
  });
  const pending = runs.some(isReviewRunPending);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];

  function updateDraft(patch: Partial<typeof draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    saveCodeDraft(draftScope, problem.problem_id, next);
    if (patch.language)
      try {
        saveLastJudgeLanguage(patch.language);
      } catch {
        /* Editing still works without storage. */
      }
  }

  return (
    <div
      className={`grid min-w-0 items-start gap-5 ${canSubmit ? 'xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]' : ''}`}
    >
      <div className="grid min-w-0 gap-4">
        {assets.error ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          >
            첨부 파일을 불러오지 못했습니다.{' '}
            <button
              className="underline underline-offset-4"
              type="button"
              onClick={() => void assets.refetch()}
            >
              다시 시도
            </button>
          </p>
        ) : null}
        <section
          aria-label="문제 본문"
          className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white [&>article]:px-4 sm:[&>article]:px-6"
        >
          <ProblemStatementPanel problem={problem} assets={assets.data} />
        </section>
        {canViewEditorial && hasProblemEditorial(problem) ? (
          <details className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <summary className="cursor-pointer px-4 py-4 text-sm font-medium text-slate-600">
              해설 확인
            </summary>
            <div className="border-t border-slate-100 [&>article]:px-4 sm:[&>article]:px-6">
              <ProblemEditorialPanel problem={problem} assets={assets.data} />
            </div>
          </details>
        ) : null}
      </div>
      {canSubmit ? (
        <div className="grid min-w-0 gap-4">
          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 [&_h2]:text-base">
            <ProblemSubmitPanel
              title="검수 코드 제출"
              layout="standalone"
              editorHeight={360}
              language={draft.language}
              sourceCode={draft.sourceCode}
              isSubmitting={pending}
              onLanguageChange={(language) => updateDraft({ language })}
              onSourceCodeChange={(sourceCode) => updateDraft({ sourceCode })}
              onSubmit={() => {
                setSelectedRunId('');
                onSubmit(draft.language, draft.sourceCode);
              }}
              submitLabel="테스트 제출"
              submittingLabel="채점 진행 중"
              message=""
              messageStatus="idle"
              footer={
                <p className="text-xs leading-5 text-slate-500">
                  작성 코드는 계정·대회·문제별로 이 브라우저에 자동 저장됩니다.
                </p>
              }
            />
          </section>
          {runs.length ? (
            <section className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                이번 검수의 제출 이력{' '}
                <span className="font-normal text-slate-400">
                  {runs.length}건
                </span>
              </h3>
              <div className="grid max-h-48 gap-1 overflow-y-auto">
                {runs.map((run, index) => (
                  <button
                    key={run.id}
                    type="button"
                    aria-pressed={selectedRun?.id === run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs ${selectedRun?.id === run.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <span>
                      #{runs.length - index} ·{' '}
                      {new Date(run.startedAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}{' '}
                      · {judgeLanguageLabel(run.language)}
                    </span>
                    <span className="font-medium">{runLabel(run)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <p className="px-1 text-xs leading-5 text-slate-500">
              코드를 제출하면 진행률과 결과가 여기에 표시됩니다.
            </p>
          )}
          {selectedRun ? (
            <ProblemReviewResult
              run={selectedRun}
              onResume={() => onResume(selectedRun)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function runLabel(run: ProblemReviewRun) {
  return run.phase === 'error'
    ? '요청 오류'
    : run.phase === 'submitting'
      ? '제출 중'
      : submissionStatusLabel(run.submission?.status);
}
