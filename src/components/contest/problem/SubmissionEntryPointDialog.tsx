import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import type { SubmissionEntryPointCheck } from '@/domains/submissionScoreboard/submissionEntryPoint';

type Props = {
  check: SubmissionEntryPointCheck;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SubmissionEntryPointDialog({
  check,
  onClose,
  onConfirm,
}: Props) {
  if (!check.issues.length) return null;
  const languageLabel = check.language === 'java8' ? 'Java' : 'Kotlin';
  return (
    <ModalDialog
      title={`${languageLabel} 제출 전 확인`}
      aria-label={`${languageLabel} 제출 전 확인`}
      size="sm"
      onClose={onClose}
      closeLabel="코드로 돌아가기"
      footer={
        <>
          <ModalButton onClick={onClose}>코드 수정</ModalButton>
          <ModalButton tone="primary" onClick={onConfirm}>
            그대로 제출
          </ModalButton>
        </>
      }
    >
      <div className="grid min-w-0 gap-4">
        <ul className="grid min-w-0 gap-3">
          {check.issues.map((issue, index) => (
            <li
              className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4"
              key={`${issue.code}-${index}`}
            >
              <h3 className="text-sm font-semibold break-words text-slate-900">
                {issue.title}
              </h3>
              <p className="mt-1 text-sm leading-6 break-words text-slate-600">
                {issue.description}
              </p>
            </li>
          ))}
        </ul>
        <details className="min-w-0 rounded-xl border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
            기본 제출 예시 보기
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
            <code>{check.example}</code>
          </pre>
        </details>
        <p className="text-xs leading-5 text-slate-500">
          소스 형식만 확인한 안내입니다. 실제 컴파일·실행 결과와 다를 수
          있습니다.
        </p>
      </div>
    </ModalDialog>
  );
}
