import { useCallback, useLayoutEffect, useState } from 'react';

/** Bound menus to the visible viewport and optionally their content column. */
export default function useNavigationViewport<T extends HTMLElement>(
  bottomGap = 16,
  containWithinParent = false,
  minimumVisibleHeight = 0,
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
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const styles = containWithinParent
        ? window.getComputedStyle(element)
        : null;
      const stickyTop = Number.parseFloat(styles?.top || '');
      const parent =
        styles?.position === 'sticky' && Number.isFinite(stickyTop)
          ? element.parentElement?.getBoundingClientRect()
          : null;
      // Use the column, not the menu's current height or footer-pushed top.
      // Hover expansion must not change its own available space or anchor.
      const top = parent
        ? Math.max(parent.top, stickyTop)
        : Math.max(0, element.getBoundingClientRect().top);
      const bottom = parent
        ? Math.min(viewportBottom, parent.bottom)
        : viewportBottom;
      const availableHeight = Math.max(0, Math.floor(bottom - top - bottomGap));
      const height = `${availableHeight}px`;
      if (containWithinParent)
        element.toggleAttribute(
          'data-navigation-empty',
          Boolean(
            parent && availableHeight < Math.max(1, minimumVisibleHeight),
          ),
        );
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
      if (containWithinParent) element.removeAttribute('data-navigation-empty');
    };
  }, [bottomGap, element, containWithinParent, minimumVisibleHeight]);
  return ref;
}
