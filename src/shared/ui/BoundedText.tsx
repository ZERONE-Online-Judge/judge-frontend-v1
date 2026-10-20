import {
  useMemo,
  isValidElement,
  cloneElement,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { textPreview } from '@/shared/lib/largeText';
export default function BoundedText({
  children,
  ...props
}: HTMLAttributes<HTMLPreElement> & { children?: ReactNode }) {
  const code =
    isValidElement<{ children?: string }>(children) &&
    children.type === 'code' &&
    typeof children.props.children === 'string'
      ? children
      : null;
  const source = typeof children === 'string' ? children : code?.props.children;
  const preview = useMemo(
    () => (source == null ? null : textPreview(source)),
    [source],
  );
  return (
    <>
      <pre {...props}>
        {preview
          ? code
            ? cloneElement(code, {}, preview.text)
            : preview.text
          : children}
      </pre>
      {preview?.truncated && (
        <p className="mt-2 text-xs text-amber-700" role="status">
          표시 한도를 넘어 앞부분만 표시합니다. 원본 파일이나 전체 코드 복사를
          이용하세요.
        </p>
      )}
    </>
  );
}
