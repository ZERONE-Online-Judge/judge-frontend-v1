import { useLayoutEffect, useRef } from 'react';

type FontFit = { size: number; fits: boolean };

/** Find the largest readable size without assuming a font's character widths. */
export function fitPresentationTitleSize({
  minimum,
  maximum,
  fits,
}: {
  minimum: number;
  maximum: number;
  fits: (size: number) => boolean;
}): FontFit {
  const upper = Math.max(1, maximum);
  const lower = Math.min(upper, Math.max(1, minimum));
  if (fits(upper)) return { size: upper, fits: true };
  if (!fits(lower)) return { size: lower, fits: false };
  let low = lower;
  let high = upper;
  for (let iteration = 0; iteration < 12 && high - low > 0.1; iteration++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return { size: Math.floor(low * 10) / 10, fits: true };
}

/** The observed frame/probe never change size when the fitted text changes. */
export function usePresentationTitleFit(title: string, beforeStart: boolean) {
  const frameRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const heading = titleRef.current;
    const probe = probeRef.current;
    if (!frame || !heading || !probe) return;
    let disposed = false;
    let pending = 0;

    const measure = () => {
      pending = 0;
      if (disposed || frame.clientWidth <= 0 || frame.clientHeight <= 0) return;
      const maximum = Number.parseFloat(
        window.getComputedStyle(probe).fontSize,
      );
      if (!Number.isFinite(maximum) || maximum <= 0) return;
      const minimum =
        Number.parseFloat(
          window
            .getComputedStyle(frame)
            .getPropertyValue('--presentation-title-min'),
        ) || 12;
      frame.removeAttribute('data-title-fit');
      const fits = (size: number) => {
        heading.style.fontSize = `${size}px`;
        const style = window.getComputedStyle(heading);
        const lineHeight = Number.parseFloat(style.lineHeight) || size * 0.92;
        const gap = Number.parseFloat(style.rowGap) || 0;
        const lineBoxHeight = heading.getBoundingClientRect().height;
        return (
          heading.scrollWidth <= frame.clientWidth + 0.5 &&
          heading.scrollHeight <= frame.clientHeight + 1 &&
          lineBoxHeight <= lineHeight * 2 + gap + 1
        );
      };
      frame.dataset.titleLayout = 'flow';
      const result = fitPresentationTitleSize({ minimum, maximum, fits });
      heading.style.fontSize = `${result.size}px`;
      frame.dataset.titleFit = result.fits ? 'fitted' : 'minimum';
    };
    const schedule = () => {
      if (!disposed && !pending)
        pending = window.requestAnimationFrame(measure);
    };
    const observer = window.ResizeObserver
      ? new window.ResizeObserver(schedule)
      : null;
    observer?.observe(frame);
    observer?.observe(probe);
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    void document.fonts?.ready.then(schedule);
    measure();
    return () => {
      disposed = true;
      if (pending) window.cancelAnimationFrame(pending);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [title, beforeStart]);

  return { frameRef, titleRef, probeRef };
}
