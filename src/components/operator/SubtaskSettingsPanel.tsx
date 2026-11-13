import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProblemTestcaseSet } from '@/domains/problemManagement/api';
import {
  subtaskDrafts,
  nextSubtaskId,
  validateSubtaskDrafts,
  type SubtaskDraft,
} from '@/domains/problemManagement/subtasks';
import type { TestcaseSet } from '@/domains/problemManagement/types';
import type { ContestScoringMode } from '@/domains/contestAdministration/types';
import { IOI_RULES_URL } from '@/domains/submissionScoreboard/scoring';
import { formatApiError } from '@/shared/api/errors';

export default function SubtaskSettingsPanel({
  contestId,
  problemId,
  token,
  testcaseSet,
  scoringMode = 'icpc',
}: {
  contestId: string;
  problemId: string;
  token: string;
  testcaseSet: TestcaseSet;
  scoringMode?: ContestScoringMode;
}) {
  const client = useQueryClient();
  const [initial, setInitial] = useState(testcaseSet.subtasks ?? []);
  const [drafts, setDrafts] = useState(() =>
    subtaskDrafts(testcaseSet.subtasks ?? []),
  );
  const [saved, setSaved] = useState(false);
  const orders = (testcaseSet.testcases ?? []).map(
    (test) => test.display_order,
  );
  const validation = validateSubtaskDrafts(drafts, orders);
  const changed =
    JSON.stringify(drafts) !== JSON.stringify(subtaskDrafts(initial));
  const total = drafts.reduce(
    (sum, draft) => sum + (Number(draft.points) || 0),
    0,
  );
  const locked = scoringMode !== 'ioi' || testcaseSet.subtasks_locked === true;
  const save = useMutation({
    mutationFn: () =>
      updateProblemTestcaseSet(
        contestId,
        problemId,
        testcaseSet.testcase_set_id,
        token,
        { subtasks: validation.groups, expected_subtasks: initial },
      ),
    onSuccess: (updated) => {
      setInitial(updated.subtasks ?? []);
      setDrafts(subtaskDrafts(updated.subtasks ?? []));
      setSaved(true);
      void client.invalidateQueries({
        queryKey: ['operator', 'problem-testcase-sets', contestId, problemId],
      });
      void client.invalidateQueries({
        queryKey: ['operator', 'problem-package-status', contestId, problemId],
      });
    },
  });
  const update = (index: number, field: keyof SubtaskDraft, value: string) => {
    setSaved(false);
    setDrafts((previous) =>
      previous.map((draft, current) =>
        current === index ? { ...draft, [field]: value } : draft,
      ),
    );
  };
  const inputClass =
    'h-11 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
  return (
    <section
      aria-label="서브태스크 설정"
      className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            서브태스크 배점{' '}
            <span
              className={`ml-2 tabular-nums ${drafts.length && total !== 100 ? 'text-amber-700' : 'text-indigo-700'}`}
            >
              {scoringMode !== 'ioi'
                ? 'IOI 점수제 전용'
                : drafts.length
                  ? `${total} / 100점`
                  : '전체 통과 100점'}
            </span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {scoringMode === 'ioi'
              ? '각 그룹의 테스트를 모두 통과하면 해당 배점을 받습니다. 그룹별 최고점은 여러 제출에서 합산합니다.'
              : '서브태스크 배점은 IOI 점수제 대회에서만 사용합니다.'}
          </p>
        </div>
        <a
          href={IOI_RULES_URL}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-indigo-700 underline underline-offset-4"
        >
          IOI 채점 규칙 ↗
        </a>
      </div>
      {scoringMode !== 'ioi' ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
          대회 설정에서 채점 방식을 ‘IOI 점수제’로 선택하면 서브태스크를 구성할
          수 있습니다.
        </p>
      ) : testcaseSet.subtasks_locked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
          참가자 제출이 있어 구성을 변경할 수 없습니다. 기존 배점으로
          채점·재채점합니다.
        </p>
      ) : (
        <p className="text-xs leading-5 text-slate-500">
          테스트 번호는 1-5, 8, 10처럼 입력하세요. 같은 테스트를 여러 그룹에
          넣을 수 있으며 모든 테스트가 배정되어야 합니다.
        </p>
      )}
      <fieldset
        disabled={locked || save.isPending}
        className="grid min-w-0 gap-3 disabled:opacity-70"
      >
        {drafts.map((draft, index) => (
          <div
            key={draft.id}
            className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[minmax(0,1fr)_7rem]"
          >
            <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
              이름
              <input
                className={inputClass}
                maxLength={120}
                value={draft.name}
                onChange={(event) => update(index, 'name', event.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
              배점
              <input
                className={inputClass}
                inputMode="numeric"
                min={1}
                max={100}
                type="number"
                value={draft.points}
                onChange={(event) =>
                  update(index, 'points', event.target.value)
                }
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
              테스트 번호
              <input
                className={inputClass}
                placeholder="1-5, 8, 10"
                value={draft.testcases}
                onChange={(event) =>
                  update(index, 'testcases', event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="h-11 self-end rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setSaved(false);
                setDrafts((previous) =>
                  previous.filter((_, current) => current !== index),
                );
              }}
            >
              서브태스크 삭제
            </button>
          </div>
        ))}
        {!drafts.length ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
            {scoringMode === 'ioi'
              ? '일반문제 · 모든 테스트를 통과하면 100점, 그렇지 않으면 0점입니다.'
              : '현재 대회는 ICPC 방식으로 정답 / 오답 채점이 적용됩니다.'}
          </p>
        ) : null}
        <button
          type="button"
          className="h-10 w-fit rounded-lg border border-indigo-200 bg-white px-4 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:text-slate-400"
          disabled={drafts.length >= 100 || orders.length === 0}
          onClick={() => {
            setSaved(false);
            setDrafts((previous) => [
              ...previous,
              {
                id: nextSubtaskId(previous.map((draft) => draft.id)),
                name: `서브태스크 ${previous.length + 1}`,
                points: previous.length ? '' : '100',
                testcases: previous.length ? '' : orders.join(', '),
              },
            ]);
          }}
        >
          + 서브태스크 추가
        </button>
      </fieldset>
      {validation.error && changed ? (
        <p role="alert" className="text-xs leading-5 text-amber-800">
          {validation.error}
        </p>
      ) : null}
      {save.error ? (
        <p role="alert" className="text-xs leading-5 text-rose-700">
          {formatApiError(
            save.error,
            '서브태스크 설정을 저장하지 못했습니다. 새로고침하여 최신 구성을 확인하세요.',
          )}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-xs text-emerald-700">
          서브태스크 배점을 저장했습니다.
        </p>
      ) : null}
      {!locked ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-medium text-slate-600 disabled:opacity-40"
            disabled={!changed || save.isPending}
            onClick={() => {
              setDrafts(subtaskDrafts(initial));
              setSaved(false);
              save.reset();
            }}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            disabled={!changed || !!validation.error || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '저장 중' : '서브태스크 저장'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
