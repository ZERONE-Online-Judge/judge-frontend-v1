import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import type { CHeaderCaseIssue } from '@/shared/lib/cHeaderCase';

type Props = {
  language: 'C' | 'C++';
  issues: CHeaderCaseIssue[];
  onClose: () => void;
  onConfirm: () => void;
};

export default function SubmissionHeaderCaseDialog({
  language,
  issues,
  onClose,
  onConfirm,
}: Props) {
  if (!issues.length) return null;
  return (
    <ModalDialog
      title={`${language} 제출 전 확인`}
      aria-label={`${language} 제출 전 확인`}
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
        <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            헤더 이름의 대소문자를 확인하세요
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            표준 헤더는 아래 이름을 사용합니다. 리눅스 채점 환경에서는
            대소문자를 구분합니다.
          </p>
          <ul className="mt-4 grid gap-3">
            {issues.slice(0, 100).map((issue, index) => (
              <li
                key={`${issue.line}-${issue.header}-${index}`}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <span className="shrink-0 text-slate-500">{issue.line}행</span>
                <code className="min-w-0 font-mono break-all text-slate-700">
                  &lt;{issue.header}&gt;
                </code>
                <span aria-label="권장 표기" className="text-slate-400">
                  →
                </span>
                <code className="min-w-0 font-mono font-semibold break-all text-indigo-700">
                  &lt;{issue.suggestion}&gt;
                </code>
              </li>
            ))}
          </ul>
          {issues.length > 100 && (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              같은 기준으로 확인할 항목이 {issues.length - 100}개 더 있습니다.
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-slate-500">
          코드는 자동으로 바꾸지 않습니다. 직접 확인한 뒤 그대로 제출할 수도
          있습니다.
        </p>
      </div>
    </ModalDialog>
  );
}
