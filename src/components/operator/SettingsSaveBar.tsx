import { SettingsIcon } from '@/components/operator/OperatorShell';
import './SettingsSaveBar.css';

export default function SettingsSaveBar({
  changedCount,
  pending,
  savedMessage,
  error,
  onReset,
  label = '설정 저장',
  description = '펼친 항목과 접힌 항목의 변경사항을 함께 저장합니다.',
  pristineMessage = '저장된 설정과 같습니다',
  saveLabel = '변경사항 저장',
  disabled = false,
  saveDisabled = false,
}: {
  changedCount: number;
  pending: boolean;
  savedMessage: string;
  error?: string;
  onReset: () => void;
  label?: string;
  description?: string;
  pristineMessage?: string;
  saveLabel?: string;
  disabled?: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="operator-settings-savebar" aria-label={label}>
      <div className="min-w-0" aria-live="polite">
        <strong>
          {changedCount
            ? `${changedCount}개 항목 변경됨`
            : savedMessage || pristineMessage}
        </strong>
        {error ? (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        ) : (
          <p>{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="settings-reset"
          disabled={!changedCount || pending || disabled}
          onClick={onReset}
        >
          되돌리기
        </button>
        <button
          type="submit"
          className="settings-save"
          disabled={!changedCount || pending || disabled || saveDisabled}
        >
          <SettingsIcon />
          {pending ? '저장 중…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
