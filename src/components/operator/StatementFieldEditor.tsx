import { useId, type TextareaHTMLAttributes } from 'react';
import BoundedTextarea from '@/shared/ui/BoundedTextarea';
import StatementImageTools from '@/shared/ui/StatementImageTools';
import type { StatementImageAsset } from '@/shared/lib/statementImages';
import type { ProblemAsset } from '@/domains/problemManagement/types';
import { statementImageAsset } from '@/domains/problemManagement/statementImageAssets';
import { textPreview } from '@/shared/lib/largeText';

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  identity: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  assets?: ProblemAsset[];
  onUpload?: (file: File) => Promise<StatementImageAsset>;
};

export default function StatementFieldEditor({
  identity,
  label,
  value,
  onChange,
  assets = [],
  onUpload,
  readOnly,
  disabled,
  className,
  ...props
}: Props) {
  const generatedId = useId();
  const id = props.id || generatedId;
  const locked = readOnly || disabled || textPreview(value).truncated;
  return (
    <div className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
      <label htmlFor={id}>{label}</label>
      <StatementImageTools
        key={identity}
        identity={identity}
        label={label}
        value={value}
        onChange={onChange}
        assets={assets
          .filter((asset) => asset.mime_type.startsWith('image/'))
          .map(statementImageAsset)}
        onUpload={onUpload}
        readOnly={locked}
      >
        <BoundedTextarea
          {...props}
          id={id}
          aria-label={props['aria-label'] || label}
          className={
            className ||
            'min-h-28 w-full resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-6 text-slate-950 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'
          }
          value={value}
          readOnly={readOnly}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </StatementImageTools>
    </div>
  );
}
