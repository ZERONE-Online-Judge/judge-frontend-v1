import Select from '@/shared/ui/Select';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import type { Division } from '@/domains/contestAdministration/types';
import type { Problem } from '@/domains/problemManagement/types';
import {
  getEditorLibrary,
  getEditorPackage,
  prepareEditorPackage,
  importEditorProject,
  editorFolderPath,
  previewEditorUpdate,
  type PackageUpdatePreview,
} from '@/domains/problemManagement/editorLibrary';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError, isChangeNoticeCancelled } from '@/shared/api/errors';
import EditorUpdateModal from '@/components/operator/EditorUpdateModal';
import EditorPackageImportHint from '@/components/operator/EditorPackageImportHint';

export default function EditorImportPanel({
  contestId,
  token,
  divisions,
  problems,
  activeDivisionId,
  disabled,
  onImported,
}: {
  contestId: string;
  token: string;
  divisions: Division[];
  problems: Problem[];
  activeDivisionId: string;
  disabled: boolean;
  onImported: (problem: Problem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [folder, setFolder] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [testsets, setTestsets] = useState<string[]>(['tests']);
  const [language, setLanguage] = useState('korean');
  const [jobId, setJobId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [targetId, setTargetId] = useState('');
  const [updatePreview, setUpdatePreview] =
    useState<PackageUpdatePreview | null>(null);
  const library = useQuery({
    queryKey: [
      'editor-library',
      contestId,
      tokenQueryIdentity(token),
      query,
      offset,
      folder,
    ],
    queryFn: () => getEditorLibrary(contestId, token, query, offset, folder),
    enabled: open,
  });
  const selected = library.data?.problems.find((p) => p.id === selectedId);
  const packageQuery = useQuery({
    queryKey: [
      'editor-package',
      contestId,
      tokenQueryIdentity(token),
      selectedId,
      jobId,
    ],
    queryFn: () => getEditorPackage(contestId, token, selectedId, jobId),
    enabled: open && !!selectedId && !!jobId,
    refetchInterval: (q) =>
      ['queued', 'running'].includes(q.state.data?.status || '') ? 2500 : false,
  });
  const prepare = useMutation({
    mutationFn: () =>
      prepareEditorPackage(contestId, token, selectedId, testsets, language),
    onSuccess: (job) => {
      setJobId(job.id);
      void library.refetch();
    },
  });
  const previewUpdate = useMutation({
    mutationFn: () =>
      previewEditorUpdate(contestId, token, selectedId, jobId, targetId),
    onSuccess: setUpdatePreview,
  });
  const importing = useMutation({
    mutationFn: () =>
      importEditorProject(
        contestId,
        token,
        selectedId,
        jobId,
        divisionId,
        code,
      ),
    onSuccess: (problem) => {
      setOpen(false);
      setMessage(
        `${problem.problem_code}. ${problem.title} 문제를 Editor에서 가져왔습니다. 채점 번들을 자동으로 준비합니다.`,
      );
      onImported(problem);
    },
  });
  const rows = library.data?.problems || [];
  const packageData =
    packageQuery.data ||
    (prepare.data?.id === jobId ? prepare.data : undefined);
  const active =
    packageData?.status === 'queued' || packageData?.status === 'running';
  const ready =
    packageData?.status === 'completed' &&
    packageData.package?.format === 'zoj' &&
    packageData.package.verified &&
    !packageQuery.error;
  const busy =
    prepare.isPending || importing.isPending || previewUpdate.isPending;
  const duplicate = problems.some(
    (p) => p.division_id === divisionId && p.problem_code === code.trim(),
  );
  const error =
    library.error ||
    prepare.error ||
    packageQuery.error ||
    importing.error ||
    previewUpdate.error;
  function resetPackage() {
    setJobId('');
    prepare.reset();
    importing.reset();
    previewUpdate.reset();
    setUpdatePreview(null);
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled || !divisions.length}
        onClick={() => {
          setOpen(true);
          setMessage('');
          setSelectedId('');
          setDivisionId(activeDivisionId);
          setCode('');
          setTargetId('');
          resetPackage();
        }}
        className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
      >
        Editor에서 가져오기
      </button>
      {message && (
        <p role="status" className="w-full text-sm text-emerald-700">
          {message}
        </p>
      )}
      {open && (
        <ModalDialog
          title="Editor 문제 가져오기 · 업데이트"
          eyebrow="ZOJ Editor"
          size="wide"
          description="전송 권한이 있는 개인·협업·팀 폴더 문제의 검증된 공유 리비전을 등록하거나 기존 문제에 적용합니다."
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          footer={
            <>
              <ModalButton disabled={busy} onClick={() => setOpen(false)}>
                닫기
              </ModalButton>
              <ModalButton
                tone="primary"
                disabled={
                  busy ||
                  !selected ||
                  !ready ||
                  (!targetId && (!divisionId || !code.trim() || duplicate))
                }
                onClick={() =>
                  targetId ? previewUpdate.mutate() : importing.mutate()
                }
              >
                {importing.isPending
                  ? '문제 가져오는 중…'
                  : targetId
                    ? '업데이트 변경 내용 확인'
                    : '이 대회에 문제 가져오기'}
              </ModalButton>
            </>
          }
        >
          <EditorPackageImportHint />
          {library.isPending && (
            <p role="status" className="text-sm text-slate-500">
              내 Editor 문제를 확인하고 있습니다.
            </p>
          )}
          {library.data && (
            <div className="grid gap-5">
              <p className="rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                <strong>{library.data.email}</strong>
                <span className="ml-2 text-xs text-indigo-700">
                  ZOJ 전송 권한이 있는 개인·협업·팀 폴더 문제를 표시합니다.
                </span>
              </p>
              {!library.data.configured ? (
                <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                  Editor 연결을 먼저 설정해야 합니다. 서비스 관리자에게 서버
                  연결 설정을 요청하세요.
                </p>
              ) : !library.data.account_exists ? (
                <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  같은 이메일의 Editor 계정이 없습니다.{' '}
                  <a
                    className="font-semibold text-indigo-600"
                    href={library.data.editor_url || 'https://editor.zoj.kr'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Editor에서 로그인
                  </a>
                  해 문제를 작성하세요.
                </div>
              ) : (
                <>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="min-w-0">
                      <h3 className="mb-3 text-sm font-bold text-slate-900">
                        1. 가져올 문제 선택
                      </h3>
                      <form
                        className="mb-3 flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          setQuery(search);
                          setOffset(0);
                          setSelectedId('');
                          resetPackage();
                        }}
                      >
                        <input
                          aria-label="Editor 문제 검색"
                          placeholder="문제 이름·식별자 검색"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded-lg border border-slate-200 px-3 text-sm"
                        >
                          검색
                        </button>
                      </form>
                      <Select
                        aria-label="Editor 폴더"
                        value={folder}
                        onChange={(e) => {
                          setFolder(e.target.value);
                          setOffset(0);
                          setSelectedId('');
                          resetPackage();
                        }}
                        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="all">모든 폴더</option>
                        <option value="root">분류되지 않은 문제</option>
                        {library.data.folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {editorFolderPath(library.data!.folders, f.id)}
                          </option>
                        ))}
                      </Select>
                      <div
                        className="grid max-h-80 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2"
                        aria-label="Editor 문제 목록"
                      >
                        {rows.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={busy}
                            aria-pressed={p.id === selectedId}
                            onClick={() => {
                              setSelectedId(p.id);
                              setTestsets([
                                p.testsets.includes('tests')
                                  ? 'tests'
                                  : p.testsets[0] || 'tests',
                              ]);
                              setLanguage(
                                p.statement_languages.includes('korean')
                                  ? 'korean'
                                  : p.statement_languages[0] || 'korean',
                              );
                              resetPackage();
                            }}
                            className={`rounded-lg border px-3 py-3 text-left ${p.id === selectedId ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}
                          >
                            <strong className="block text-sm text-slate-900">
                              {p.name}
                            </strong>
                            <span className="mt-1 block text-xs text-slate-500">
                              {p.slug} · 공유 r{p.revision}
                              {p.folder_id &&
                                ` · ${editorFolderPath(library.data!.folders, p.folder_id)}`}
                            </span>
                            {p.uncommitted && (
                              <span className="mt-1 block text-xs text-amber-700">
                                커밋되지 않은 개인 변경 있음
                              </span>
                            )}
                          </button>
                        ))}
                        {!rows.length && (
                          <p className="p-4 text-sm text-slate-500">
                            표시할 문제가 없습니다.
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          전체 {library.data.total}개 · 검색 결과{' '}
                          {rows.length ? offset + 1 : 0}~
                          {Math.min(
                            offset + library.data.problems.length,
                            library.data.total,
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button
                            disabled={busy || offset === 0}
                            onClick={() => {
                              setOffset(Math.max(0, offset - 100));
                              setSelectedId('');
                              resetPackage();
                            }}
                          >
                            이전
                          </button>
                          <button
                            disabled={
                              busy || offset + 100 >= library.data.total
                            }
                            onClick={() => {
                              setOffset(offset + 100);
                              setSelectedId('');
                              resetPackage();
                            }}
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    </section>
                    <section className="min-w-0">
                      <h3 className="mb-3 text-sm font-bold text-slate-900">
                        2. 공유 리비전 검증
                      </h3>
                      {selected ? (
                        <div className="grid gap-3">
                          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                            <strong>{selected.name}</strong>
                            <p className="mt-1 text-xs">
                              공유 r{packageData?.revision ?? selected.revision}
                              의 지문·풀이·전체 테스트·checker·validator를
                              가져옵니다.
                            </p>
                            {selected.uncommitted && (
                              <p className="mt-2 text-xs text-amber-700">
                                개인 작업 사본의 변경은 포함하지 않습니다. 그
                                변경을 가져오려면 Editor에서 먼저 커밋하세요.
                              </p>
                            )}
                            <a
                              className="mt-2 inline-block text-xs font-semibold text-indigo-600"
                              href={selected.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Editor에서 문제 확인{' '}
                              <InterfaceIcon name="arrowRight" />
                            </a>
                          </div>
                          <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                            <legend className="px-1 text-xs text-slate-600">
                              사용할 테스트 세트 · 여러 개 선택
                            </legend>
                            {selected.testsets.map((s) => (
                              <label
                                key={s}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  disabled={busy || active}
                                  checked={testsets.includes(s)}
                                  onChange={(e) => {
                                    setTestsets(
                                      e.target.checked
                                        ? [...testsets, s]
                                        : testsets.filter((name) => name !== s),
                                    );
                                    resetPackage();
                                  }}
                                />
                                {s}
                              </label>
                            ))}
                            <p className="text-xs leading-5 text-slate-500">
                              선택한 세트의 테스트를 합쳐 ZOJ의 활성 테스트로
                              등록합니다. 패키지 검증은 필수입니다.
                            </p>
                          </fieldset>
                          <label className="grid gap-1 text-xs text-slate-600">
                            기본 지문 언어
                            <Select
                              value={language}
                              disabled={busy || active}
                              onChange={(e) => {
                                setLanguage(e.target.value);
                                resetPackage();
                              }}
                              className="rounded-lg border border-slate-200 p-2 text-sm"
                            >
                              {selected.statement_languages.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </Select>
                          </label>
                          <p className="text-xs leading-5 text-slate-500">
                            선택한 언어를 기본으로 사용하고, Editor에 작성한
                            다른 번역 지문도 함께 가져옵니다.
                          </p>
                          <button
                            type="button"
                            disabled={busy || active || !testsets.length}
                            onClick={() => prepare.mutate()}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {active
                              ? '검증 패키지 준비 중…'
                              : ready
                                ? '검증 패키지 다시 확인'
                                : '검증 패키지 준비'}
                          </button>
                          {packageData && (
                            <div
                              role="status"
                              className={`rounded-lg p-3 text-sm ${ready ? 'bg-emerald-50 text-emerald-800' : packageData.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-indigo-50 text-indigo-800'}`}
                            >
                              <strong>
                                {ready
                                  ? '검증 완료 · 가져올 준비가 되었습니다.'
                                  : active
                                    ? 'Editor 격리 워커에서 실제 검증 중입니다.'
                                    : packageData.status === 'failed'
                                      ? '패키지 검증을 완료하지 못했습니다.'
                                      : '검증을 요청했습니다.'}
                              </strong>
                              <p className="mt-1 text-xs whitespace-pre-wrap">
                                {packageData.summary ||
                                  '화면을 닫아도 검증 작업은 계속됩니다.'}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                          목록에서 문제를 선택하세요.
                        </p>
                      )}
                    </section>
                  </div>
                  <section className="border-t border-slate-200 pt-4">
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      3. 새 문제 등록 또는 기존 문제 업데이트
                    </h3>
                    <label className="mb-3 grid gap-1 text-xs text-slate-600">
                      적용 대상
                      <Select
                        value={targetId}
                        disabled={busy}
                        onChange={(e) => {
                          setTargetId(e.target.value);
                          previewUpdate.reset();
                        }}
                        className="rounded-lg border border-slate-200 p-2 text-sm"
                      >
                        <option value="">새 문제로 등록</option>
                        {problems.map((p) => (
                          <option key={p.problem_id} value={p.problem_id}>
                            {
                              divisions.find(
                                (d) => d.division_id === p.division_id,
                              )?.name
                            }{' '}
                            · {p.problem_code}. {p.title} 업데이트
                          </option>
                        ))}
                      </Select>
                    </label>
                    {!targetId && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-xs text-slate-600">
                            참가 유형
                            <Select
                              value={divisionId}
                              disabled={importing.isPending}
                              onChange={(e) => setDivisionId(e.target.value)}
                              className="rounded-lg border border-slate-200 p-2 text-sm"
                            >
                              <option value="">선택하세요</option>
                              {divisions.map((d) => (
                                <option
                                  key={d.division_id}
                                  value={d.division_id}
                                >
                                  {d.name}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="grid gap-1 text-xs text-slate-600">
                            문제 번호
                            <input
                              value={code}
                              maxLength={16}
                              disabled={importing.isPending}
                              placeholder="예: A"
                              onChange={(e) => setCode(e.target.value)}
                              className="rounded-lg border border-slate-200 p-2 text-sm"
                            />
                          </label>
                        </div>
                        {duplicate && (
                          <p role="alert" className="mt-2 text-xs text-red-600">
                            이 참가 유형에 같은 문제 번호가 있습니다.
                          </p>
                        )}
                      </>
                    )}
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {targetId
                        ? '업데이트 전에 변경 내용을 확인하고 이전 패키지를 백업합니다. 기존 제출과 판정은 유지되며 필요한 경우 별도로 재채점하세요.'
                        : '새 문제로 등록합니다. 같은 요청을 재시도해도 중복 생성하지 않습니다.'}
                    </p>
                  </section>
                </>
              )}
            </div>
          )}
          {error && !isChangeNoticeCancelled(error) && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-700"
            >
              {formatApiError(error, 'Editor 요청을 처리하지 못했습니다')}
            </p>
          )}
        </ModalDialog>
      )}
      {updatePreview && (
        <EditorUpdateModal
          contestId={contestId}
          token={token}
          projectId={selectedId}
          jobId={jobId}
          preview={updatePreview}
          onClose={() => setUpdatePreview(null)}
          onUpdated={(problem) => {
            setOpen(false);
            setMessage(
              `${problem.problem_code}. ${problem.title} 패키지를 업데이트했습니다. 기존 제출은 별도로 재채점할 수 있습니다.`,
            );
            onImported(problem);
          }}
        />
      )}
    </>
  );
}
