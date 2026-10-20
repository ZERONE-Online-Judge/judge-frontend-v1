import Select from '@/shared/ui/Select';
import type { Dispatch, SetStateAction } from 'react';
import type { Contest } from '@/domains/contestAdministration/types';
import { ChoiceCard } from '@/components/common/ManagementCards';
import { NoticeIcon } from '@/components/operator/OperatorShell';
import NoticeCountdownText, {
  NoticeCountdownCommands,
} from '@/components/contest/NoticeCountdownText';
export type NoticeForm = {
  body: string;
  emergency: boolean;
  noticeId: string;
  pinned: boolean;
  title: string;
  visibility: 'public' | 'participants';
};

export default function NoticeEditorFields({
  form,
  setForm,
  contest,
  pending = false,
}: {
  form: NoticeForm;
  setForm: Dispatch<SetStateAction<NoticeForm>>;
  contest?: Contest;
  pending?: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <TextInput
          label="제목"
          onChange={(value) => setForm((prev) => ({ ...prev, title: value }))}
          value={form.title}
        />
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          공개 범위
          <Select
            className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                visibility: event.target.value as NoticeForm['visibility'],
              }))
            }
            value={form.visibility}
          >
            <option value="participants">참가자</option>
            <option value="public">공개</option>
          </Select>
        </label>
      </div>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        본문
        <textarea
          className="min-h-36 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          onChange={(event) =>
            setForm((prev) => ({ ...prev, body: event.target.value }))
          }
          value={form.body}
        />
      </label>
      <NoticeCountdownCommands
        onInsert={(command) =>
          setForm((current) => ({
            ...current,
            body: [current.body.trimEnd(), command].filter(Boolean).join('\n'),
          }))
        }
      />
      {form.body.includes('{{countdown:') ? (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-indigo-600">
            참가자에게 보이는 문구
          </p>
          <p className="text-sm leading-6 whitespace-pre-wrap text-slate-700">
            <NoticeCountdownText text={form.body} contest={contest} />
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Toggle
            checked={form.pinned}
            label="상단 고정"
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, pinned: checked }))
            }
          />
          <Toggle
            checked={form.emergency}
            label="긴급 공지"
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, emergency: checked }))
            }
          />
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:bg-slate-300"
          disabled={pending}
          type="submit"
        >
          <NoticeIcon />
          {form.noticeId ? '공지 수정' : '공지 등록'}
        </button>
      </div>
    </>
  );
}
function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <ChoiceCard
      checked={checked}
      onChange={onChange}
      type="checkbox"
      title={label}
    />
  );
}
