import { textPreview } from '@/shared/lib/largeText';
import BoundedText from './BoundedText';
import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { sharedUiText } from '@/data/uiText';
import { editorLanguageForJudgeLanguage } from '@/domains/problemManagement/document';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

type CodeEditorProps = {
  value: string;
  language: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  height?: number | string;
};

export default function CodeEditor({
  value,
  language,
  onChange,
  disabled = false,
  height = 320,
}: CodeEditorProps) {
  const preview = useMemo(() => textPreview(value), [value]);
  const [rejected, setRejected] = useState(false);
  const restoring = useRef(false);
  const editorRef = useRef<{ setValue: (value: string) => void } | null>(null);
  const editorHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 shadow-inner"
      onPasteCapture={(event) => {
        const incoming = event.clipboardData.getData('text/plain');
        if (
          textPreview(incoming).truncated ||
          incoming.length + value.length > 524288
        ) {
          event.preventDefault();
          setRejected(true);
        }
      }}
    >
      {(preview.truncated || rejected) && (
        <p role="status" className="p-3 text-xs text-amber-200">
          편집기 표시 한도를 넘었습니다. 큰 소스는 파일로 관리하거나 크기를 줄여
          주세요. 원본 내용은 변경하지 않았습니다.
        </p>
      )}
      {preview.truncated ? (
        <BoundedText className="max-h-96 overflow-auto p-4 font-mono text-xs whitespace-pre text-slate-100">
          {preview.text}
        </BoundedText>
      ) : (
        <Suspense
          fallback={
            <div
              className="flex items-center justify-center text-sm font-semibold text-slate-400"
              style={{ height: editorHeight }}
            >
              {sharedUiText.codeEditorLoading}
            </div>
          }
        >
          <MonacoEditor
            height={editorHeight}
            language={editorLanguageForJudgeLanguage(language)}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            onChange={(nextValue) => {
              if (restoring.current) return;
              const next = nextValue ?? '';
              if (textPreview(next).truncated) {
                setRejected(true);
                editorRef.current?.setValue(value);
                return;
              }
              setRejected(false);
              onChange(next);
            }}
            options={{
              automaticLayout: true,
              bracketPairColorization: { enabled: true },
              cursorBlinking: 'smooth',
              detectIndentation: false,
              fontSize: 14,
              fontFamily:
                'JetBrains Mono, Fira Code, Consolas, Menlo, Monaco, monospace',
              guides: {
                bracketPairs: true,
                indentation: true,
              },
              insertSpaces: true,
              lineHeight: 22,
              minimap: { enabled: false },
              overviewRulerBorder: false,
              padding: { top: 14, bottom: 14 },
              readOnly: disabled,
              renderLineHighlight: 'all',
              renderWhitespace: 'selection',
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              tabSize: 4,
              wordWrap: 'off',
              largeFileOptimizations: true,
              maxTokenizationLineLength: 2000,
              stopRenderingLineAfter: 4000,
            }}
            theme="vs-dark"
            value={value}
          />
        </Suspense>
      )}
    </div>
  );
}
