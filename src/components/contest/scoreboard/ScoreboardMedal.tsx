import type {
  ScoreboardRelease,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';

const medals = {
  1: { label: '금메달', fill: '#f5c84c', edge: '#b97816', shine: '#fff1af' },
  2: { label: '은메달', fill: '#d7e0ea', edge: '#7b8da3', shine: '#f8fafc' },
  3: { label: '동메달', fill: '#dca071', edge: '#995b36', shine: '#ffe0bc' },
} as const;

type ScoreboardMedalProps = {
  release?: ScoreboardRelease | null;
  row: Pick<ScoreboardRow, 'rank' | 'is_revealed'>;
};

export default function ScoreboardMedal({
  release,
  row,
}: ScoreboardMedalProps) {
  // A resolver team can finish revealing while other teams still move its rank.
  const rankReleased = release?.mode === 'all';

  if (!rankReleased || row.is_revealed === false) return null;
  if (row.rank !== 1 && row.rank !== 2 && row.rank !== 3) return null;

  const medal = medals[row.rank];
  const label = `${row.rank}위 ${medal.label}`;

  return (
    <svg
      aria-label={label}
      className="h-7 w-6 shrink-0"
      focusable="false"
      role="img"
      viewBox="0 0 24 28"
    >
      <title>{label}</title>
      <path d="M3 1h6l5 10-5 3z" fill="#7181dd" />
      <path d="M15 1h6l-6 13-5-3z" fill="#4f5fbd" />
      <circle cx="12" cy="17" r="10" fill={medal.fill} />
      <circle
        cx="12"
        cy="17"
        r="7.5"
        fill="none"
        stroke={medal.edge}
        strokeWidth="0.8"
      />
      <path
        d="M5 15a7.3 7.3 0 0 1 7-5"
        fill="none"
        stroke={medal.shine}
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <text
        x="12"
        y="21"
        fill={medal.edge}
        fontFamily="system-ui, sans-serif"
        fontSize="11"
        fontWeight="800"
        textAnchor="middle"
      >
        {row.rank}
      </text>
    </svg>
  );
}
