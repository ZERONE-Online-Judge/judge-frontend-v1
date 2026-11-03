import type { ScoreboardRow } from './types';

type ScoreboardRankSection = {
  key: 'final' | 'frozen' | 'live';
  label: string | null;
  rows: ScoreboardRow[];
};

/** Only explicit manual-release metadata separates final and frozen rankings. */
export function scoreboardRankSections(
  rows: ScoreboardRow[],
): ScoreboardRankSection[] {
  if (!rows.some((row) => row.rank_is_final !== undefined)) {
    return [{ key: 'live', label: null, rows }];
  }

  return [
    {
      key: 'final' as const,
      label: '확정 순위',
      rows: rows.filter((row) => row.rank_is_final === true),
    },
    {
      key: 'frozen' as const,
      label: '미공개 · 프리즈 순위',
      rows: rows.filter((row) => row.rank_is_final !== true),
    },
  ].filter((section) => section.rows.length > 0);
}
