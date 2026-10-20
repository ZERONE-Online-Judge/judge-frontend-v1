import { useState } from 'react';
import BoundedText from '@/shared/ui/BoundedText';
import { downloadStorageObject } from '@/domains/problemManagement/api';
import type { TextPreview } from '@/shared/lib/largeText';
export default function StorageFileContent({
  preview,
  storageKey,
  token,
}: {
  preview?: TextPreview;
  storageKey: string;
  token: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setError('');
    try {
      await downloadStorageObject(storageKey, token);
    } catch {
      setError('원본 다운로드를 시작하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {preview?.binary
            ? '바이너리 파일입니다.'
            : preview?.truncated
              ? '큰 파일의 앞부분만 표시합니다.'
              : '파일 내용'}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          원본 다운로드
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
      <BoundedText className="max-h-96 min-h-28 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 whitespace-pre text-slate-50">
        {preview?.text || '(빈 파일)'}
      </BoundedText>
    </div>
  );
}
