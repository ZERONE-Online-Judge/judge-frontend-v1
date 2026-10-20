import Select from '@/shared/ui/Select';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import ModalDialog from '@/shared/ui/ModalDialog';
import type { Division } from '@/domains/contestAdministration/types';
import type { Problem } from '@/domains/problemManagement/types';
import {
  importProblemArchive,
  inspectProblemArchive,
} from '@/domains/problemManagement/archive';
import { formatApiError } from '@/shared/api/errors';
import EditorImportPanel from './EditorImportPanel';

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}

export default function ProblemArchivePanel({
  contestId,
  token,
  divisions,
  problems,
  activeDivisionId,
  unsaved,
  disabled,
  onCreate,
  onImported,
}: {
  contestId: string;
  token: string;
  divisions: Division[];
  problems: Problem[];
  activeDivisionId: string;
  unsaved: boolean;
  disabled: boolean;
  onCreate: () => void;
  onImported: (problem: Problem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [problemCode, setProblemCode] = useState('');
  const [fileError, setFileError] = useState('');
  const [message, setMessage] = useState('');
  const inspect = useMutation({
    mutationFn: (selected: File) =>
      inspectProblemArchive(contestId, token, selected),
    onSuccess: (preview) => setProblemCode(preview.problem.problem_code),
  });
  const importing = useMutation({
    mutationFn: () =>
      importProblemArchive(contestId, token, file!, divisionId, problemCode),
    onSuccess: (problem) => {
      setOpen(false);
      setFile(null);
      inspect.reset();
      setMessage(
        `${problem.problem_code}. ${problem.title} 문제를 등록했습니다. 활성 테스트케이스의 채점용 번들을 자동으로 준비합니다.`,
      );
      onImported(problem);
    },
  });
  const preview = inspect.data;
  const busy = inspect.isPending || importing.isPending;
  const duplicate = problems.some(
    (problem) =>
      problem.division_id === divisionId &&
      problem.problem_code === problemCode.trim(),
  );
  const error =
    fileError ||
    (inspect.error
      ? formatApiError(inspect.error, '파일을 확인하지 못했습니다')
      : '') ||
    (importing.error
      ? formatApiError(importing.error, '문제를 등록하지 못했습니다')
      : '');

  return (
    <>
      <section
        aria-label="문제 추가하기"
        className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            문제 추가하기
          </h2>
          <div className="flex flex-wrap gap-2">
            <EditorImportPanel
              contestId={contestId}
              token={token}
              divisions={divisions}
              problems={problems}
              activeDivisionId={activeDivisionId}
              disabled={disabled || busy || unsaved}
              onImported={onImported}
            />
            <button
              type="button"
              className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
              disabled={disabled || busy || !divisions.length}
              onClick={() => {
                setOpen(true);
                setDivisionId(activeDivisionId);
                setFile(null);
                setFileError('');
                setMessage('');
                inspect.reset();
                importing.reset();
              }}
            >
              ZOJ ZIP 불러오기
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={disabled || busy || !activeDivisionId}
              onClick={onCreate}
            >
              새 문제 생성하기
            </button>
          </div>
        </div>
        {!divisions.length ? (
          <p className="text-xs text-slate-600">
            참가 유형을 먼저 추가해 주세요.
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
      </section>
      {open ? (
        <ModalDialog
          title="ZOJ ZIP 불러오기"
          description="파일을 확인한 뒤 새 문제로 등록합니다."
          size="lg"
          onClose={busy ? undefined : () => setOpen(false)}
          footer={
            <>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !preview ||
                  !file ||
                  !divisionId ||
                  !problemCode.trim() ||
                  duplicate
                }
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => importing.mutate()}
              >
                {importing.isPending ? '문제 등록 중…' : '새 문제로 등록'}
              </button>
            </>
          }
        >
          <div className="grid min-w-0 gap-5">
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-800">
              ZOJ 문제 ZIP 파일
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={busy}
                className="block w-full min-w-0 rounded-lg border border-slate-200 p-3 text-xs file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setFileError('');
                  inspect.reset();
                  importing.reset();
                  if (!selected) return;
                  if (selected.size > 512 * 1024 * 1024) {
                    setFileError('512 MiB 이하의 ZIP을 선택해 주세요.');
                    return;
                  }
                  if (!selected.name.toLowerCase().endsWith('.zip')) {
                    setFileError('ZOJ에서 내보낸 ZIP 파일을 선택해 주세요.');
                    return;
                  }
                  inspect.mutate(selected);
                }}
              />
              <span className="text-xs leading-5 font-normal text-slate-600">
                최대 512 MiB · 압축 해제 후 2 GiB · ZOJ 문제 ZIP 형식 v1
              </span>
            </label>
            {busy ? (
              <p
                role="status"
                className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800"
              >
                {importing.isPending
                  ? '파일을 전송하고 문제를 등록하고 있습니다. 완료될 때까지 이 창을 유지해 주세요.'
                  : '파일을 전송해 내용과 무결성을 확인하고 있습니다.'}
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </p>
            ) : null}
            {preview ? (
              <>
                <section
                  className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                  aria-label="가져올 문제 요약"
                >
                  <h3 className="font-semibold break-words text-slate-950">
                    {preview.problem.problem_code}. {preview.problem.title}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                    {[
                      `예제 ${preview.example_count}개`,
                      `첨부·검증 파일 ${preview.asset_count}개`,
                      `테스트케이스 ${preview.testcase_count}개`,
                      `전체 ${sizeLabel(preview.total_bytes)}`,
                    ].map((item) => (
                      <span className="rounded bg-white px-2 py-1" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600">
                    기본 제한 {preview.problem.time_limit_ms} ms /{' '}
                    {preview.problem.memory_limit_mb} MB · 언어별 제한도 함께
                    복원합니다.
                  </p>
                  <details className="text-xs text-slate-700">
                    <summary className="cursor-pointer py-1 font-semibold">
                      포함된 버전과 파일 보기
                    </summary>
                    <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto break-words">
                      {preview.testcase_sets.map((item) => (
                        <p key={item.version}>
                          테스트케이스 v{item.version} · {item.count}개
                          {item.is_active ? ' · 활성' : ''}
                        </p>
                      ))}
                      {preview.assets.map((item, index) => (
                        <p key={index}>{item.filename}</p>
                      ))}
                      {!preview.assets.length &&
                      !preview.testcase_sets.length ? (
                        <p>첨부 파일과 테스트케이스가 없는 문제입니다.</p>
                      ) : null}
                    </div>
                  </details>
                </section>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-800">
                    등록할 참가 유형
                    <Select
                      aria-label="등록할 참가 유형"
                      disabled={busy}
                      value={divisionId}
                      onChange={(event) => {
                        setDivisionId(event.target.value);
                        importing.reset();
                      }}
                      className="h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      <option value="">유형 선택</option>
                      {divisions.map((division) => (
                        <option
                          key={division.division_id}
                          value={division.division_id}
                        >
                          {division.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-800">
                    등록할 문제 번호
                    <input
                      disabled={busy}
                      maxLength={16}
                      value={problemCode}
                      onChange={(event) => {
                        setProblemCode(event.target.value);
                        importing.reset();
                      }}
                      className="h-11 min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </label>
                </div>
                {duplicate ? (
                  <p role="alert" className="text-sm text-rose-700">
                    선택한 유형에 같은 문제 번호가 있습니다. 다른 번호를
                    입력하세요.
                  </p>
                ) : null}
                <p className="text-xs leading-6 text-slate-600">
                  새 문제를 목록 마지막에 추가하고, 활성 테스트케이스가 있으면
                  채점용 번들을 자동 생성합니다. 검증 코드는 등록 후
                  테스트케이스 탭에서 다시 실행할 수 있습니다.
                </p>
                {preview.has_external_links ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    외부 URL이 포함되어 있습니다. ZOJ에 첨부한 파일은 복원되지만
                    외부 링크의 파일은 ZIP에 포함되지 않습니다.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
