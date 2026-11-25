import { useState } from 'react';
import type { ReactNode } from 'react';
import { useFileDrop } from '../hooks/useFileDrop';
import type { FileDropOptions } from '../hooks/useFileDrop';
import './FileDropZone.css';

type FileDropZoneProps = FileDropOptions & {
  children: ReactNode;
  label?: string;
  hint?: string;
  className?: string;
  showSelection?: boolean;
  variant?: 'panel' | 'inline';
};

export function FileDropZone({
  children,
  label = '파일 업로드',
  hint = '파일을 끌어다 놓거나 아래에서 선택하세요.',
  className = '',
  showSelection = true,
  variant = 'panel',
  ...options
}: FileDropZoneProps) {
  const [names, setNames] = useState('');
  const { isDragging, error, clearError, dropProps } = useFileDrop({
    ...options,
    onFiles: (files, event) => {
      setNames(files.map((file) => file.name).join(', '));
      return options.onFiles(files, event);
    },
  });
  return (
    <div
      {...dropProps}
      data-file-drop-zone=""
      data-file-drop-active={isDragging || undefined}
      aria-disabled={options.disabled || undefined}
      role="group"
      aria-label={label}
      className={`file-drop-zone file-drop-zone--${variant} ${options.disabled ? 'is-disabled' : ''} ${className}`}
      onChangeCapture={(event) => {
        if ((event.target as HTMLInputElement).type === 'file') {
          setNames('');
          clearError();
        }
      }}
    >
      {variant === 'panel' ? (
        <p className="file-drop-zone__hint">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
          <span>
            <strong>{isDragging ? '여기에 놓으세요' : label}</strong>
            <span>{hint}</span>
          </span>
        </p>
      ) : null}
      {children}
      {variant === 'inline' && isDragging ? (
        <p className="file-drop-zone__drop-prompt" role="status">
          여기에 놓아 업로드
        </p>
      ) : null}
      {showSelection && names && !error && (
        <p className="file-drop-zone__selection" role="status">
          {names}
        </p>
      )}
      {error && (
        <p className="file-drop-zone__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
