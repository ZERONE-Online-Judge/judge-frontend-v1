import { useCallback, useEffect, useState } from 'react';

export type PresentationTheme = 'dark' | 'light' | 'contrast';
export type PresentationDisplayPreferences = {
  theme: PresentationTheme;
  fontScale: number;
  autoScrollVertical: boolean;
  autoScrollHorizontal: boolean;
};

export const PRESENTATION_DISPLAY_PREFERENCES_KEY =
  'zoj.presentation.display-preferences.v1';
export const DEFAULT_PRESENTATION_DISPLAY_PREFERENCES: PresentationDisplayPreferences =
  {
    theme: 'dark',
    fontScale: 1,
    autoScrollVertical: true,
    autoScrollHorizontal: true,
  };

export function normalizePresentationDisplayPreferences(
  value: unknown,
): PresentationDisplayPreferences {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    theme:
      raw.theme === 'light' || raw.theme === 'contrast' ? raw.theme : 'dark',
    fontScale:
      typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale)
        ? Math.round(Math.min(3, Math.max(0.8, raw.fontScale)) * 10) / 10
        : 1,
    autoScrollVertical: raw.autoScrollVertical !== false,
    autoScrollHorizontal: raw.autoScrollHorizontal !== false,
  };
}

export function readPresentationDisplayPreferences(): PresentationDisplayPreferences {
  // Each open display keeps its own settings. Local storage supplies defaults
  // only when this tab has not saved its own preferences yet.
  for (const storageName of ['sessionStorage', 'localStorage'] as const) {
    try {
      const saved = window[storageName].getItem(
        PRESENTATION_DISPLAY_PREFERENCES_KEY,
      );
      if (saved !== null) {
        return normalizePresentationDisplayPreferences(JSON.parse(saved));
      }
    } catch {
      // A restricted or corrupt store must not prevent opening the display.
    }
  }
  return { ...DEFAULT_PRESENTATION_DISPLAY_PREFERENCES };
}

export function usePresentationDisplayPreferences() {
  const [preferences, setPreferences] = useState(
    readPresentationDisplayPreferences,
  );
  useEffect(() => {
    for (const storageName of ['sessionStorage', 'localStorage'] as const) {
      try {
        window[storageName].setItem(
          PRESENTATION_DISPLAY_PREFERENCES_KEY,
          JSON.stringify(preferences),
        );
      } catch {
        // The display remains configurable when browser storage is unavailable.
      }
    }
  }, [preferences]);
  const setTheme = useCallback((theme: PresentationTheme) => {
    setPreferences((previous) =>
      normalizePresentationDisplayPreferences({ ...previous, theme }),
    );
  }, []);
  const setFontScale = useCallback((fontScale: number) => {
    setPreferences((previous) =>
      normalizePresentationDisplayPreferences({ ...previous, fontScale }),
    );
  }, []);
  const resetFontScale = useCallback(() => setFontScale(1), [setFontScale]);
  const setAutoScrollVertical = useCallback((autoScrollVertical: boolean) => {
    setPreferences((previous) =>
      normalizePresentationDisplayPreferences({
        ...previous,
        autoScrollVertical,
      }),
    );
  }, []);
  const setAutoScrollHorizontal = useCallback(
    (autoScrollHorizontal: boolean) => {
      setPreferences((previous) =>
        normalizePresentationDisplayPreferences({
          ...previous,
          autoScrollHorizontal,
        }),
      );
    },
    [],
  );
  return {
    ...preferences,
    setTheme,
    setFontScale,
    resetFontScale,
    setAutoScrollVertical,
    setAutoScrollHorizontal,
  };
}
