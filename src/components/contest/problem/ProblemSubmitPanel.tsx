import Select from '@/shared/ui/Select';
import { type ReactNode, useState } from 'react';
import CodeEditor from '@/shared/ui/CodeEditor';
import PageNotice from '@/shared/ui/PageNotice';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';

type ProblemSubmitPanelProps = {
  allowedLanguages?: JudgeLanguage[];
  problemCode?: string;
  problemTitle?: string;
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
  { label: 'Python 3.13', value: 'python313' },
  { label: 'Java 8', value: 'java8' },
  { label: 'C99', value: 'c99' },
  { label: 'PyPy 3.9 (7.3.15)', value: 'pypy3' },
  { label: 'Kotlin 1.9.24', value: 'kotlin' },
];

export default function ProblemSubmitPanel({
  allowedLanguages,
  problemCode,
  problemTitle,
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
        disabled={isSubmitting || !sourceCode.trim() || !canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>

      <div className="mt-4">
        <PageNotice message={message} status={messageStatus} />
      </div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </aside>
  );
}
