import { useId, useState } from 'react';
import {
  normalizeProblemCode,
  problemCodeError,
  PROBLEM_CODE_HINT,
  PROBLEM_CODE_MAX_LENGTH,
} from '@/domains/problemManagement/problemCode';

export default function ProblemCodeInput({
  label = '문제 번호',
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [composing, setComposing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const error =
    (value || attempted) && !composing ? problemCodeError(value) : '';
  return (
    <div className="grid min-w-0 content-start gap-2 text-sm font-semibold text-slate-700">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`h-11 min-w-0 rounded-lg border px-3 text-sm font-medium text-slate-950 transition outline-none focus:ring-4 disabled:opacity-60 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'}`}
        value={value}
        disabled={disabled}
        required
        maxLength={PROBLEM_CODE_MAX_LENGTH}
        pattern="[A-Za-z0-9]{1,16}"
        title={PROBLEM_CODE_HINT}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        onInvalid={(event) => {
          event.preventDefault();
          setAttempted(true);
          const input = event.currentTarget;
          window.requestAnimationFrame(() => {
            if (!input.isConnected) return;
            input.focus({ preventScroll: true });
            input.scrollIntoView?.({ block: 'center', behavior: 'auto' });
          });
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          onChange(normalizeProblemCode(event.currentTarget.value));
        }}
        onChange={(event) => {
          onChange(
            composing
              ? event.target.value
              : normalizeProblemCode(event.target.value),
          );
        }}
      />
      <div className="flex items-start justify-between gap-2 text-xs font-normal text-slate-500">
        <span id={`${id}-hint`}>{PROBLEM_CODE_HINT}</span>
        <span className="shrink-0 tabular-nums" aria-hidden="true">
          {value.length}/{PROBLEM_CODE_MAX_LENGTH}
        </span>
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-rose-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
