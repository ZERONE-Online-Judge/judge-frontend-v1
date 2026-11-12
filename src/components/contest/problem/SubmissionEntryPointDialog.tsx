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
  const hasWarnings = check.issues.length > 0;
  const languageLabel = check.language === 'java8' ? 'Java' : 'Kotlin';
  return (
    <ModalDialog
      title={`${languageLabel} 제출 전 확인`}
      aria-label={`${languageLabel} 제출 전 확인`}
      description="저장 파일명과 실행에 필요한 기본 형식을 확인해 주세요."
      size="md"
      onClose={onClose}
      closeLabel="코드로 돌아가기"
      footer={
        <>
          <ModalButton onClick={onClose}>코드 수정</ModalButton>
          <ModalButton tone="primary" onClick={onConfirm}>
            {hasWarnings ? '주의사항 확인 후 제출' : '확인하고 제출'}
          </ModalButton>
        </>
      }
    >
      <div className="grid min-w-0 gap-5">
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm leading-6',
            hasWarnings
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950',
          ].join(' ')}
          role="status"
        >
          {hasWarnings
            ? `확인이 필요한 항목이 ${check.issues.length}개 있습니다.`
            : '기본 실행 형식을 확인했습니다.'}
        </div>
        <dl className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">저장 파일</dt>
            <dd className="mt-1 font-mono text-sm font-semibold break-all text-slate-900">
              {check.filename}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-slate-500">실행 방식</dt>
            <dd className="mt-1 font-mono text-sm break-all text-slate-900">
              {check.launchCommand}
            </dd>
          </div>
        </dl>
        {hasWarnings ? (
          <ul className="grid min-w-0 gap-3">
            {check.issues.map((issue, index) => (
              <li
                className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
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
        ) : null}
        <details className="min-w-0 rounded-xl border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
            기본 제출 예시
          </summary>
          <pre className="max-h-64 overflow-auto border-t border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
            <code>{check.example}</code>
          </pre>
        </details>
        <p className="text-xs leading-5 text-slate-500">
          이 확인은 소스 구조만 살피는 정적 검사입니다. 실제 컴파일·실행이나
          정답 여부를 보장하지 않습니다. 경고가 잘못 표시된 경우에도 내용을
          확인한 뒤 제출할 수 있습니다.
        </p>
      </div>
    </ModalDialog>
  );
}
