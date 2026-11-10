import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import './StatementImage.css';

type Props = {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
};

function ImageLoad({ src, alt = '', className, style, compact }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const mounted = useRef(true);
  const decoding = useRef(false);
  const failed = useRef(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const fail = useCallback(() => {
    failed.current = true;
    if (mounted.current) setState('error');
  }, []);
  const ready = useCallback(
    async (element: HTMLImageElement) => {
      if (!mounted.current || decoding.current || failed.current) return;
      decoding.current = true;
      try {
        if (!element.naturalWidth) throw new Error('Image did not load');
        await element.decode?.();
        if (mounted.current && !failed.current) setState('ready');
      } catch {
        fail();
      }
    },
    [fail],
  );
  useEffect(() => {
    mounted.current = true;
    if (image.current?.complete) void ready(image.current);
    return () => {
      mounted.current = false;
    };
  }, [ready]);

  return (
    <span
      className={
        compact ? 'statement-image statement-image--compact' : 'statement-image'
      }
      data-statement-image-state={state}
      aria-busy={state === 'loading'}
    >
      <img
        ref={image}
        src={src}
        alt={alt}
        className={className}
        style={style}
        decoding="async"
        hidden={state !== 'ready'}
        onLoad={(event) => void ready(event.currentTarget)}
        onError={fail}
      />
      {state !== 'ready' && (
        <span
          className="statement-image-placeholder"
          data-error={state === 'error'}
          style={{
            ...style,
            display: style?.display ? 'flex' : undefined,
            width: style?.width || (compact ? '100%' : 'min(100%, 32rem)'),
            minHeight: style?.height ? 0 : undefined,
          }}
          role="status"
        >
          <span
            className={
              state === 'loading'
                ? 'statement-image-spinner'
                : 'statement-image-failed-icon'
            }
            aria-hidden="true"
          >
            {state === 'error' ? '!' : null}
          </span>
          <span className="statement-image-message">
            <span>
              {state === 'loading'
                ? '이미지를 불러오고 있습니다'
                : '이미지를 불러오지 못했습니다'}
            </span>
            {alt && <span className="statement-image-alt">{alt}</span>}
          </span>
        </span>
      )}
    </span>
  );
}

export default function StatementImage(props: Props) {
  // A new authorized URL/source must never display the previous image or let
  // its pending decode completion update the replacement image's state.
  return <ImageLoad key={props.src} {...props} />;
}
