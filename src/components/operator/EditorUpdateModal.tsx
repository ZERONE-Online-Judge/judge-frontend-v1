import BoundedText from '@/shared/ui/BoundedText';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import {
  applyEditorUpdate,
  downloadPackageBackup,
  type PackageUpdatePreview,
} from '@/domains/problemManagement/editorLibrary';
import type { Problem } from '@/domains/problemManagement/types';
import { formatApiError } from '@/shared/api/errors';

export default function EditorUpdateModal({
  contestId,
  token,
  projectId,
  jobId,
  preview,
  onClose,
  onUpdated,
}: {
  contestId: string;
  token: string;
  projectId: string;
  jobId: string;
  preview: PackageUpdatePreview;
  onClose: () => void;
  onUpdated: (problem: Problem) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();
  const apply = useMutation({
    mutationFn: () =>
      applyEditorUpdate(
        contestId,
        token,
        projectId,
        jobId,
        preview,
        reason.trim(),
        confirmed,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['package-updates', contestId, preview.target_problem_id],
      });
    },
  });
  const backup = useMutation({
    mutationFn: () => downloadPackageBackup(apply.data!.backup_url, token),
  });
  const done = () => {
    if (apply.data) onUpdated(apply.data.problem);
    onClose();
  };
  return (
    <ModalDialog
      title={`${preview.problem_code}. ${preview.title} 업데이트`}
      eyebrow="검증된 Editor 패키지"
      description={`${preview.contest_title} · ${preview.division_name}`}
      size="wide"
      onClose={() => {
        if (!apply.isPending) done();
      }}
      footer={
        apply.data ? (
          <>
            <ModalButton
              disabled={backup.isPending}
              onClick={() => backup.mutate()}
            >
              이전 패키지 백업 다운로드
            </ModalButton>
            <ModalButton tone="primary" onClick={done}>
              완료
            </ModalButton>
          </>
        ) : (
          <>
            <ModalButton disabled={apply.isPending} onClick={onClose}>
              취소
            </ModalButton>
            <ModalButton
              tone="primary"
              disabled={
                apply.isPending ||
                !reason.trim() ||
                (preview.contest_running && !confirmed)
              }
              onClick={() => apply.mutate()}
            >
              {apply.isPending ? '업데이트 중…' : '확인한 패키지 적용'}
            </ModalButton>
          </>
        )
      }
    >
      {apply.data ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
        >
          패키지를 업데이트하고 이전 자료를 백업했습니다. 기존 제출의 판정과
          제출 시간은 유지됩니다. 새 채점 기준을 기존 제출에 적용하려면 재채점을
          실행하세요.
        </p>
      ) : (
        <div className="grid gap-5">
          <p className="rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
            {preview.preserved}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">활성 테스트</dt>
              <dd>
                {preview.current_testcase_count}개{' '}
                <InterfaceIcon name="arrowRight" />{' '}
                {preview.incoming_testcase_count}개
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">새 버전 시작</dt>
              <dd>v{preview.next_testcase_version}</dd>
            </div>
            <div>
              <dt className="text-slate-500">보존할 제출</dt>
              <dd>{preview.submission_count}개</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-600">
            테스트 추가 {preview.testcase_changes.added}개 · 변경{' '}
            {preview.testcase_changes.changed}개 · 제거{' '}
            {preview.testcase_changes.removed}개
          </p>
          <section>
            <h3 className="mb-2 text-sm font-semibold">문제 설정 변경</h3>
            <ul className="grid gap-2 text-sm">
              {preview.changes
                .filter((c) => c.changed)
                .map((c) => (
                  <li key={c.field}>
                    {[
                      'statement',
                      'editorial',
                      'statement_translations',
                      'editorial_translations',
                    ].includes(c.field) ? (
                      <details>
                        <summary className="cursor-pointer">
                          {c.label} 변경
                        </summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          {[
                            ['이전', c.before],
                            ['변경 후', c.after],
                          ].map(([label, text]) => (
                            <div key={label}>
                              <p className="mb-1 text-xs text-slate-500">
                                {label}
                              </p>
                              <BoundedText className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs break-words whitespace-pre-wrap">
                                {text}
                              </BoundedText>
                            </div>
                          ))}
                        </div>
                        {c.truncated && (
                          <p className="mt-1 text-xs text-slate-500">
                            긴 내용은 각각 처음 2,000자까지 표시합니다.
                          </p>
                        )}
                      </details>
                    ) : (
                      `${c.label}: ${c.before} → ${c.after}`
                    )}
                  </li>
                ))}
              {!preview.changes.some((c) => c.changed) && (
                <li className="text-slate-500">지문과 기본 제한 변경 없음</li>
              )}
            </ul>
          </section>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              첨부·채점 파일 변경 {preview.changed_file_count}개
            </summary>
            <ul className="mt-3 grid max-h-48 gap-2 overflow-y-auto text-xs">
              {preview.files.map((f, i) => (
                <li key={i}>
                  {
                    { added: '추가', removed: '제거', changed: '변경' }[
                      f.change
                    ]
                  }{' '}
                  · {f.filename} · {f.category}
                </li>
              ))}
            </ul>
            {preview.changed_file_count > preview.files.length && (
              <p className="mt-2 text-xs text-slate-500">
                처음 {preview.files.length}개만 표시합니다.
              </p>
            )}
          </details>
          <label className="grid gap-2 text-sm font-semibold">
            업데이트 이유
            <textarea
              rows={3}
              maxLength={1000}
              value={reason}
              disabled={apply.isPending}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-slate-200 p-3 font-normal"
              placeholder="변경 내용과 이유를 운영 로그에 남깁니다."
            />
          </label>
          {preview.contest_running && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={apply.isPending}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1"
              />
              진행 중인 대회의 문제를 변경합니다. 기존 판정은 유지되며 필요한
              제출은 별도로 재채점해야 함을 확인했습니다.
            </label>
          )}
        </div>
      )}
      {(apply.error || backup.error) && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {formatApiError(
            apply.error || backup.error,
            '업데이트를 처리하지 못했습니다. 닫은 뒤 변경 내용을 다시 확인해 주세요.',
          )}
        </p>
      )}
    </ModalDialog>
  );
}
