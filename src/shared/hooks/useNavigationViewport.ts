import { useCallback, useLayoutEffect, useState } from 'react';

/** A sticky menu may start below its sticky top before the page is scrolled. */
export default function useNavigationViewport<T extends HTMLElement>(
  bottomGap = 16,
  keepStickyTop = false,
) {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  useLayoutEffect(() => {
    if (!element) return;
    let frame: number | undefined;
    const request =
      window.requestAnimationFrame?.bind(window) ||
      ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    const cancel =
      window.cancelAnimationFrame?.bind(window) ||
      window.clearTimeout.bind(window);
    const measure = () => {
      frame = undefined;
      const viewport = window.visualViewport;
      const bottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const actualTop = element.getBoundingClientRect().top;
      const styles = keepStickyTop ? window.getComputedStyle(element) : null;
      const stickyTop = Number.parseFloat(styles?.top || '');
      // A sticky aside is pushed up at the end of its layout, before the
      // footer. Let its visible menu retain the header offset in that case.
      const offset =
        styles?.position === 'sticky' && Number.isFinite(stickyTop)
          ? Math.max(0, stickyTop - actualTop)
          : 0;
      if (keepStickyTop) {
        const value = `${offset}px`;
        if (
          element.style.getPropertyValue('--zoj-navigation-top-offset') !==
          value
        )
          element.style.setProperty('--zoj-navigation-top-offset', value);
      }
      const top = Math.max(0, actualTop + offset);
      const height = `${Math.max(0, Math.floor(bottom - top - bottomGap))}px`;
      if (
        element.style.getPropertyValue('--zoj-navigation-available-height') !==
        height
      )
        element.style.setProperty('--zoj-navigation-available-height', height);
    };
    const schedule = () => {
      if (frame === undefined) frame = request(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule, {
      passive: true,
    });
    window.visualViewport?.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(element);
    if (element.parentElement) observer?.observe(element.parentElement);
    const header = element.ownerDocument.querySelector('.site-header');
    if (header) observer?.observe(header);
    return () => {
      if (frame !== undefined) cancel(frame);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      if (keepStickyTop)
        element.style.removeProperty('--zoj-navigation-top-offset');
    };
  }, [bottomGap, element, keepStickyTop]);
  return ref;
}
