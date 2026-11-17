import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import CollapsibleEditor from '@/components/operator/CollapsibleEditor';
import {
  createOperatorDivision,
  deleteOperatorDivision,
  updateOperatorDivision,
} from '@/domains/contestAdministration/api';
import { isContestOperationLocked } from '@/domains/contestAdministration/logic';
import type { Contest, Division } from '@/domains/contestAdministration/types';
import { formatApiError } from '@/shared/api/errors';
import useConfirmation from '@/shared/ui/useConfirmation';
import { useFrontendUpdateBlocker } from '@/shared/hooks/useFrontendUpdateBlocker';

const emptyForm = { divisionId: '', name: '', description: '' };

export default function ParticipantDivisionsPanel({
  contestId,
  token,
  contest,
  divisions,
}: {
  contestId: string;
  token: string;
  contest: Contest;
  divisions: Division[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState('');
  const queryClient = useQueryClient();
  const locked = isContestOperationLocked(contest);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
      };
      return form.divisionId
        ? updateOperatorDivision(contestId, form.divisionId, token, body)
        : createOperatorDivision(contestId, token, body);
    },
    onSuccess: () => {
      setForm(emptyForm);
      setSaved('참가 유형을 저장했습니다.');
      for (const name of ['dashboard', 'divisions', 'participants']) {
        void queryClient.invalidateQueries({
          queryKey: ['operator', name, contestId],
        });
      }
    },
  });
  const remove = useMutation({
    mutationFn: (divisionId: string) =>
      deleteOperatorDivision(contestId, divisionId, token),
    onSuccess: () => {
      setForm(emptyForm);
      setSaved('참가 유형을 삭제했습니다.');
      for (const name of [
        'dashboard',
        'divisions',
        'participants',
        'problems',
      ]) {
        void queryClient.invalidateQueries({
          queryKey: ['operator', name, contestId],
        });
      }
    },
  });
  const { confirm, dialog } = useConfirmation();
  const selected = divisions.find(
    (division) => division.division_id === form.divisionId,
  );
  const dirty =
    form.name !== (selected?.name ?? '') ||
    form.description !== (selected?.description ?? '');
  useFrontendUpdateBlocker(dirty);
  useFrontendUpdateBlocker(save.isPending || remove.isPending, 'operation');
  const guard = {
    confirm: async (action: () => void) => {
      if (
        !dirty ||
        (await confirm('입력 중인 참가 유형 변경사항을 버리고 이동할까요?'))
      )
        action();
    },
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locked && !save.isPending && form.name.trim()) save.mutate();
  }
  return (
    <CollapsibleEditor
      open={open}
      onOpenChange={setOpen}
      busy={save.isPending || remove.isPending}
      draft={Boolean(form.name || form.description)}
      title="참가 유형 관리"
      description={
        divisions.length
          ? `${divisions.length}개 유형 · ${divisions.map((division) => division.name).join(' · ')}`
          : '참가팀 등록 전, 초등부·중등부처럼 팀을 나눌 유형을 먼저 추가하세요.'
      }
    >
      {dialog}
      {locked ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          대회 진행 중에는 참가 유형을 추가·수정·삭제할 수 없습니다.
        </p>
      ) : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          {divisions.map((division) => (
            <button
              key={division.division_id}
              type="button"
              disabled={locked || save.isPending || remove.isPending}
              aria-pressed={form.divisionId === division.division_id}
              className="min-w-0 rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-default disabled:hover:bg-white aria-pressed:border-indigo-400 aria-pressed:bg-indigo-50"
              onClick={() =>
                guard.confirm(() => {
                  setForm({
                    divisionId: division.division_id,
                    name: division.name,
                    description: division.description,
                  });
                  setSaved('');
                  save.reset();
                  remove.reset();
                })
              }
            >
              <span className="block font-semibold break-words text-slate-900">
                {division.name}
              </span>
              <span className="mt-1 block text-sm break-words text-slate-500">
                {division.description || '설명 없음'}
              </span>
            </button>
          ))}
          {!divisions.length ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              참가팀을 등록하기 전에 참가 유형을 추가해 주세요.
            </p>
          ) : null}
        </div>
        <form
          onSubmit={submit}
          className="grid content-start gap-3 rounded-lg border border-slate-200 p-4"
        >
          <h3 className="font-semibold text-slate-900">
            {form.divisionId ? '참가 유형 수정' : '참가 유형 추가'}
          </h3>
          <fieldset
            disabled={locked || save.isPending || remove.isPending}
            className="grid min-w-0 gap-3 disabled:opacity-60"
          >
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              유형 이름
              <input
                className="h-11 min-w-0 rounded-lg border border-slate-200 px-3 font-normal"
                placeholder="예: 초등부, 중등부"
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              설명
              <input
                className="h-11 min-w-0 rounded-lg border border-slate-200 px-3 font-normal"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!form.name.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {save.isPending
                  ? '저장 중…'
                  : form.divisionId
                    ? '변경사항 저장'
                    : '유형 추가'}
              </button>
              {form.divisionId ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  onClick={async () => {
                    if (
                      await confirm(
                        `‘${selected?.name ?? form.name}’ 참가 유형을 삭제할까요? 연결된 참가팀·문제·제출 또는 순위 발표 기록이 있으면 삭제되지 않습니다.`,
                        { title: '참가 유형 삭제', confirmLabel: '유형 삭제' },
                      )
                    )
                      remove.mutate(form.divisionId);
                  }}
                >
                  {remove.isPending ? '삭제 중…' : '유형 삭제'}
                </button>
              ) : null}
              {form.divisionId ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                  onClick={() =>
                    guard.confirm(() => {
                      setForm(emptyForm);
                      save.reset();
                      remove.reset();
                    })
                  }
                >
                  수정 취소
                </button>
              ) : null}
            </div>
          </fieldset>
          {remove.error ? (
            <p role="alert" className="text-sm text-rose-700">
              {formatApiError(remove.error, '참가 유형 삭제에 실패했습니다')}
            </p>
          ) : null}
          {save.error ? (
            <p role="alert" className="text-sm text-rose-700">
              {formatApiError(save.error, '참가 유형 저장에 실패했습니다')}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-emerald-700">
              {saved}
            </p>
          ) : null}
        </form>
      </div>
    </CollapsibleEditor>
  );
}
