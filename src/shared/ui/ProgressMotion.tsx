import type { ReactNode } from 'react';
import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';

export function MotionNumber({
  value,
  scope,
  className,
  fractionDigits = 0,
}: {
  value: number | null | undefined;
  scope?: string;
  className?: string;
  fractionDigits?: number;
}) {
  const display = useAnimatedValue(value, scope);
  const format = (number: number | null) =>
    number == null
      ? '—'
      : number.toLocaleString('ko-KR', {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        });
  const actual =
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return (
    <span className={className}>
      <span
        aria-hidden="true"
        className="zoj-motion-number-visual"
        data-motion-value={format(display)}
      />
      <span className="sr-only">{format(actual)}</span>
    </span>
  );
}

export function MotionProgressText({
  text = '',
  scope,
  className,
}: {
  text?: string;
  scope?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {text
        .split(/(\d[\d,]*(?:\.\d+)?)/g)
        .map((part, index) =>
          /^\d/.test(part) ? (
            <MotionNumber
              key={index}
              value={Number(part.replaceAll(',', ''))}
              fractionDigits={part.split('.')[1]?.length ?? 0}
              scope={`${scope ?? ''}:${index}`}
            />
          ) : (
            part
          ),
        )}
    </span>
  );
}

export function MotionProgress({
  value,
  max = 100,
  scope,
  label,
  valueText,
  className,
  fillClassName,
}: {
  value: number | null | undefined;
  max?: number;
  scope?: string;
  label: string;
  valueText?: string;
  className?: string;
  fillClassName?: string;
}) {
  const known =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isFinite(max) &&
    max > 0;
  const percent = known
    ? Math.max(0, Math.min(100, (value / max) * 100))
    : null;
  const display = useAnimatedValue(percent, `${scope ?? ''}:${max}`);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={valueText}
      className={`zoj-motion-progress block ${className ?? 'h-1.5 bg-slate-100'}`}
    >
      <span
        className={`zoj-motion-progress-fill ${display === null ? 'zoj-motion-indeterminate' : ''} ${fillClassName ?? 'bg-indigo-500'}`}
        style={{ width: display === null ? '30%' : `${display}%` }}
      />
    </span>
  );
}

export function ResultTransition({
  children,
  stateKey,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  stateKey: string | number;
  className?: string;
  as?: 'div' | 'span';
}) {
  return (
    <Tag key={stateKey} className={`zoj-result-enter ${className ?? ''}`}>
      {children}
    </Tag>
  );
}
