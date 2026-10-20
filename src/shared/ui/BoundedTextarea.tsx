import {
  forwardRef,
  useMemo,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { textPreview } from '@/shared/lib/largeText';
const BoundedTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function BoundedTextarea(
  { value, onChange, onPasteCapture, readOnly, ...props },
  ref,
) {
  const preview = useMemo(
    () => (typeof value === 'string' ? textPreview(value) : null),
    [value],
  );
  const [rejected, setRejected] = useState(false);
  return (
    <>
      <textarea
        {...props}
        ref={ref}
        value={preview?.text ?? value}
        readOnly={readOnly || preview?.truncated}
        onPasteCapture={(event) => {
          onPasteCapture?.(event);
          if (
            textPreview(event.clipboardData.getData('text/plain')).truncated
          ) {
            event.preventDefault();
            setRejected(true);
          }
        }}
        onChange={(event) => {
          if (textPreview(event.target.value).truncated) {
            event.target.value = typeof value === 'string' ? value : '';
            setRejected(true);
            return;
          }
          setRejected(false);
          onChange?.(event);
        }}
      />
      {(preview?.truncated || rejected) && (
        <p role="status" className="mt-2 text-xs text-amber-700">
          표시 한도를 넘어 앞부분만 표시합니다. 원본은 변경하지 않았습니다. 큰
          데이터는 파일 업로드로 관리하세요.
        </p>
      )}
    </>
  );
});
export default BoundedTextarea;
