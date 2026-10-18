import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOperatorProblems,
  updateOperatorProblem,
} from '@/domains/problemManagement/api';
import { judgeLanguages } from '@/domains/submissionScoreboard/languagePreference';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';
import type { Problem } from '@/domains/problemManagement/types';
import { formatApiError } from '@/shared/api/errors';

export default function ProblemLanguageSettings({
  contestId,
  token,
}: {
  contestId: string;
  token: string;
}) {
  const problems = useQuery({
    queryKey: ['operator', 'problems', contestId, tokenQueryIdentity(token)],
    queryFn: () => getOperatorProblems(contestId, token),
  });
  return (
    <details className="operator-settings-section">
      <summary>
        <span className="settings-section-heading">
          <strong>문제별 제출 언어</strong>
          <span>각 문제에서 참가자가 사용할 언어를 선택합니다.</span>
        </span>
        <span aria-hidden="true">
          <InterfaceIcon name="chevronDown" />
        </span>
      </summary>
      <div className="settings-section-body">
        <p className="text-xs text-slate-500">
          새 제출과 모의채점에 적용됩니다. 기존 제출과 재채점의 언어는
          유지됩니다. 문제마다 변경사항을 저장하세요.
        </p>
        {problems.isLoading ? <p>문제를 불러오는 중입니다.</p> : null}
        {problems.error ? (
          <p role="alert">
            {formatApiError(problems.error, '문제를 불러오지 못했습니다.')}
          </p>
        ) : null}
        {problems.data?.map((problem) => (
          <ProblemLanguages
            key={problem.problem_id + JSON.stringify(problem.allowed_languages)}
            problem={problem}
            contestId={contestId}
            token={token}
          />
        ))}
        {problems.data?.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 문제가 없습니다.</p>
        ) : null}
      </div>
    </details>
  );
}

function ProblemLanguages({
  problem,
  contestId,
  token,
}: {
  problem: Problem;
  contestId: string;
  token: string;
}) {
  const original = problem.allowed_languages ?? judgeLanguages;
  const [selected, setSelected] = useState<JudgeLanguage[]>(original);
  const client = useQueryClient();
  const changed = judgeLanguages.some(
    (language) => original.includes(language) !== selected.includes(language),
  );
  const save = useMutation({
    mutationFn: () =>
      updateOperatorProblem(contestId, problem.problem_id, token, {
        allowed_languages: selected,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['operator', 'problems', contestId],
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['contest-problems', contestId] }),
        client.invalidateQueries({
          queryKey: ['contest-problem', contestId, problem.problem_id],
        }),
      ]);
    },
  });
  return (
    <fieldset
      className="rounded-lg border border-slate-200 bg-white p-4"
      disabled={save.isPending}
    >
      <legend className="px-1 text-sm font-semibold">
        {problem.problem_code}. {problem.title}
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {judgeLanguages.map((language) => (
          <label
            key={language}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              className="accent-[#6d5dfc]"
              checked={selected.includes(language)}
              disabled={selected.length === 1 && selected.includes(language)}
              onChange={(event) => {
                save.reset();
                setSelected(
                  event.target.checked
                    ? [...selected, language]
                    : selected.filter((value) => value !== language),
                );
              }}
            />
            {judgeLanguageLabel(language)}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="rounded-lg bg-[#6d5dfc] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? '저장 중…' : '언어 설정 저장'}
        </button>
        {save.isSuccess ? (
          <span className="text-xs text-emerald-700">저장했습니다.</span>
        ) : null}
      </div>
      {save.error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {formatApiError(save.error, '저장하지 못했습니다.')}
        </p>
      ) : null}
    </fieldset>
  );
}
