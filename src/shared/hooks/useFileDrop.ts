import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

export type FileDropOptions = {
  onFiles: (
    files: File[],
    event?: DragEvent<HTMLElement>,
  ) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onReject?: (message: string) => void;
};

function hasFiles(transfer: DataTransfer | null) {
  return (
    !!transfer &&
    (Array.from(transfer.types || []).includes('Files') ||
      transfer.files?.length > 0)
  );
}

function fileMatches(file: File, accept: string) {
  const rules = accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return (
    !rules.length ||
    rules.some((rule) =>
      rule.startsWith('.')
        ? name.endsWith(rule)
        : rule.endsWith('/*')
          ? mime.startsWith(rule.slice(0, -1))
          : mime === rule,
    )
  );
}

// Multiple upload fields share one browser-navigation guard. Text dragging,
// links, and application-specific folder/problem moves keep their own behavior.
let guards = 0;
function preventFileNavigation(event: globalThis.DragEvent) {
  if (hasFiles(event.dataTransfer)) event.preventDefault();
}
function guardFileNavigation() {
  if (guards++ === 0) {
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
  }
  return () => {
    if (--guards === 0) {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    }
  };
}

export function useFileDrop(options: FileDropOptions) {
  const [isDragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const depth = useRef(0);
  const working = useRef(false);
  const lifecycle = useRef({ active: true });

  useEffect(() => {
    const owner = { active: true };
    lifecycle.current = owner;
    const release = guardFileNavigation();
    const reset = () => {
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener('drop', reset, true);
    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);
    return () => {
      owner.active = false;
      release();
      window.removeEventListener('drop', reset, true);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);

  function owns(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event.dataTransfer)) return false;
    const target = event.target as Element;
    const nearest =
      typeof target?.closest === 'function'
        ? target.closest('[data-file-drop-zone]')
        : null;
    return !nearest || nearest === event.currentTarget;
  }
  function reject(message: string) {
    setError(message);
    optionsRef.current.onReject?.(message);
  }
  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (!owns(event)) return;
    event.preventDefault();
    if (optionsRef.current.disabled || working.current) return;
    depth.current++;
    setDragging(true);
  }
  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!owns(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect =
      optionsRef.current.disabled || working.current ? 'none' : 'copy';
  }
  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!owns(event)) return;
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) setDragging(false);
  }
  async function onDrop(event: DragEvent<HTMLElement>) {
    if (!owns(event)) return;
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setDragging(false);
    const current = optionsRef.current;
    if (current.disabled || working.current) return;
    setError('');
    const items = Array.from(event.dataTransfer.items || []);
    if (
      items.some(
        (item) =>
          item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory,
      )
    ) {
      reject('폴더 대신 파일을 선택해 주세요.');
      return;
    }
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) {
      reject('파일을 읽지 못했습니다. 파일 선택 버튼을 사용해 주세요.');
      return;
    }
    if (!current.multiple && files.length > 1) {
      reject('한 번에 파일 하나만 올릴 수 있습니다.');
      return;
    }
    const invalid =
      current.accept &&
      files.find((file) => !fileMatches(file, current.accept!));
    if (invalid) {
      reject(
        `${invalid.name}: 지원하지 않는 파일 형식입니다. (${current.accept})`,
      );
      return;
    }
    working.current = true;
    const owner = lifecycle.current;
    try {
      await current.onFiles(files, event);
    } catch (cause) {
      if (owner.active)
        reject(
          cause instanceof Error
            ? cause.message
            : '파일을 올리지 못했습니다. 다시 시도해 주세요.',
        );
    } finally {
      working.current = false;
    }
  }
  return {
    isDragging,
    error,
    clearError: () => setError(''),
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
