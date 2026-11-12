import Select from '@/shared/ui/Select';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import CodeEditor from '@/shared/ui/CodeEditor';
import PageNotice from '@/shared/ui/PageNotice';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';
import {
  inspectSubmissionEntryPoint,
  type SubmissionEntryPointCheck,
} from '@/domains/submissionScoreboard/submissionEntryPoint';
import SubmissionEntryPointDialog from '@/components/contest/problem/SubmissionEntryPointDialog';

type ProblemSubmitPanelProps = {
  allowedLanguages?: JudgeLanguage[];
  problemCode?: string;
  problemTitle?: string;
  submissionContextKey?: string;
  language: JudgeLanguage;
  sourceCode: string;
  isSubmitting: boolean;
  message: string;
  messageStatus: 'idle' | 'loading' | 'ready' | 'error';
  onLanguageChange: (language: JudgeLanguage) => void;
  onSourceCodeChange: (sourceCode: string) => void;
  onSubmit: () => void;
  canSubmit?: boolean;
  editorHeight?: number | string;
  layout?: 'side' | 'standalone';
  title?: string;
  submitLabel?: string;
  submittingLabel?: string;
  footer?: ReactNode;
};

const languageOptions: { label: string; value: JudgeLanguage }[] = [
  { label: 'C++17', value: 'cpp17' },
  { label: 'Python 3.11', value: 'python311' },
  { label: 'Java 8', value: 'java8' },
  { label: 'C99', value: 'c99' },
  { label: 'PyPy 3.11 (8.0.1)', value: 'pypy3' },
  { label: 'Kotlin 1.9.24', value: 'kotlin' },
];

export default function ProblemSubmitPanel({
  allowedLanguages,
  problemCode,
  problemTitle,
  submissionContextKey,
  language,
  sourceCode,
  isSubmitting,
  message,
  messageStatus,
  onLanguageChange,
  onSourceCodeChange,
  onSubmit,
  canSubmit = true,
  editorHeight = 'clamp(280px, 52dvh, 560px)',
  layout = 'side',
  title = '코드 제출',
  submitLabel = '제출하기',
  submittingLabel = '제출 중',
  footer,
}: ProblemSubmitPanelProps) {
  const initialEditorHeight =
    typeof editorHeight === 'number' ? editorHeight : 430;
  const [resizedEditorHeight, setResizedEditorHeight] = useState<number | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<{
    language: JudgeLanguage;
    sourceCode: string;
    context: string;
    allowed: string;
    check: SubmissionEntryPointCheck;
  } | null>(null);
  const submitLock = useRef(false);
  const context = JSON.stringify([
    submissionContextKey ?? '',
    problemCode ?? '',
    problemTitle ?? '',
    title,
    submitLabel,
  ]);
  const allowed = allowedLanguages
    ? [...new Set(allowedLanguages)].sort().join(',')
    : '*';
  const languageAllowed =
    !allowedLanguages || allowedLanguages.includes(language);
  const submitDisabled =
    isSubmitting || !sourceCode.trim() || !canSubmit || !languageAllowed;
  const confirmationCurrent = Boolean(
    confirmation &&
    confirmation.language === language &&
    confirmation.sourceCode === sourceCode &&
    confirmation.context === context &&
    confirmation.allowed === allowed &&
    !submitDisabled,
  );
  // Discard the exact snapshot as soon as any submission input changes. A
  // later edit back to the same text must not revive an earlier confirmation.
  if (confirmation && !confirmationCurrent) setConfirmation(null);
  const entryPointGuidance = useMemo(
    () => inspectSubmissionEntryPoint(language, ''),
    [language],
  );
  function sendSubmission() {
    if (submitDisabled || submitLock.current) return;
    submitLock.current = true;
    // Guard duplicate clicks in the same event batch. Ongoing requests use
    // isSubmitting; a completed failure must allow an immediate explicit retry.
    queueMicrotask(() => {
      submitLock.current = false;
    });
    setConfirmation(null);
    onSubmit();
  }

  function requestSubmission() {
    if (submitDisabled || submitLock.current) return;
    const check = inspectSubmissionEntryPoint(language, sourceCode);
    if (check) {
      setConfirmation({ language, sourceCode, context, allowed, check });
    } else {
      sendSubmission();
    }
  }

  const panelClassName =
    layout === 'standalone'
      ? 'bg-slate-50 px-4 py-5 sm:px-7 sm:py-7'
      : 'border-t border-slate-200 bg-slate-50 px-4 py-5 sm:px-5 sm:py-7 xl:border-t-0 xl:border-l';
  const headingProblemLabel =
    problemCode || problemTitle
      ? ` - ${problemCode ? `${problemCode}. ` : ''}${problemTitle ?? ''}`
      : '';

  return (
    <aside className={`zoj-problem-submit min-w-0 ${panelClassName}`}>
      <h2 className="text-lg font-semibold tracking-tight break-words text-slate-900">
        {title}
        {headingProblemLabel}
      </h2>

      <label className="mt-6 grid gap-2">
        <span className="text-xs font-medium text-slate-500">제출 언어</span>
        <span className="relative block">
          <Select
            className="h-11 w-full min-w-0 appearance-none rounded-lg border border-slate-200 bg-white px-5 pr-11 text-sm font-bold text-slate-700 transition outline-none focus:border-[#6d5dfc] focus:ring-2 focus:ring-[#6d5dfc]/15 disabled:bg-slate-100"
            disabled={isSubmitting}
            onChange={(event) =>
              onLanguageChange(event.target.value as JudgeLanguage)
            }
            value={language}
          >
            {languageOptions
              .filter(
                (option) =>
                  !allowedLanguages || allowedLanguages.includes(option.value),
              )
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </Select>
        </span>
      </label>

      {entryPointGuidance ? (
        <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-900">
          <strong className="font-mono">{entryPointGuidance.filename}</strong>로
          저장합니다.{' '}
          {language === 'java8'
            ? 'package 선언 없이 Main 클래스와 public static void main(String[] args)를 작성해 주세요.'
            : '실행 가능한 JAR로 실행합니다. 일반적인 진입점은 파일 최상위의 fun main() 또는 fun main(args: Array<String>)입니다.'}{' '}
          제출 전에 실행 형식을 한 번 더 확인합니다.
        </p>
      ) : null}

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer py-2">편집기 높이 조절</summary>
        <label className="mt-2 grid gap-2">
          <span className="flex items-center justify-between">
            <span>편집기 높이</span>
            <span>
              {resizedEditorHeight === null
                ? '자동'
                : `${resizedEditorHeight}px`}
            </span>
          </span>
          <input
            className="accent-[#6d5dfc]"
            disabled={isSubmitting}
            max={760}
            min={280}
            onChange={(event) =>
              setResizedEditorHeight(Number(event.target.value))
            }
            step={20}
            type="range"
            value={resizedEditorHeight ?? initialEditorHeight}
          />
        </label>
      </details>

      <div className="mt-3 min-w-0">
        <CodeEditor
          disabled={isSubmitting}
          height={resizedEditorHeight ?? editorHeight}
          language={language}
          onChange={onSourceCodeChange}
          value={sourceCode}
        />
      </div>

      <button
        className="mt-4 flex h-11 w-full items-center justify-center rounded bg-[#6d5dfc] px-5 text-sm font-black text-white transition hover:bg-[#5b4be6] disabled:bg-slate-300"
        disabled={submitDisabled}
        onClick={requestSubmission}
        type="button"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>

      <div className="mt-4">
        <PageNotice message={message} status={messageStatus} />
      </div>
      {footer ? <div className="mt-4">{footer}</div> : null}
      {confirmation && confirmationCurrent ? (
        <SubmissionEntryPointDialog
          check={confirmation.check}
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmationCurrent) sendSubmission();
          }}
        />
      ) : null}
    </aside>
  );
}
